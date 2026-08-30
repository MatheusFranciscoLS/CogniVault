import type { ConsumeMessage } from 'amqplib';
import { prisma } from '../config/prisma';
import { AIService } from '../services/ai.service';
import { ensureCatalogCategory } from '../services/catalog-category-assignment';
import { refreshCatalogHealth } from '../services/catalog-health';
import { repairAutoDetectedDocumentMetadata } from '../services/catalog-metadata-repair';
import { rebuildDocumentMemory } from '../services/document-memory';
import { nextDocumentRetry } from '../utils/document-retry';
import { readableProcessingError } from '../utils/processing-error';
import { DOCUMENT_PROCESSING_QUEUE, DOCUMENT_RETRY_QUEUE, rabbitMQ } from './connection';

interface DocumentMessage {
    documentId: string;
    tenantId: string;
    jobId: string;
}

function isValidMessage(value: unknown): value is DocumentMessage {
    if (!value || typeof value !== 'object') return false;
    const message = value as Record<string, unknown>;
    return [message.documentId, message.tenantId, message.jobId]
        .every((item) => typeof item === 'string' && item.trim().length > 0);
}

async function buildAuxiliaryCatalogKnowledge(documentId: string, tenantId: string): Promise<void> {
    try {
        const document = await prisma.document.findFirst({
            where: { id: documentId, tenantId, archivedAt: null },
            select: {
                catalogRevision: true,
                parts: {
                    where: { active: true },
                    orderBy: [{ page: 'asc' }, { section: 'asc' }, { position: 'asc' }],
                    select: {
                        model: true,
                        pnc: true,
                        universalAcrossPnc: true,
                        page: true,
                        section: true,
                        position: true,
                        name: true,
                        alternativeNames: true,
                        notes: true,
                    },
                },
            },
        });
        if (!document || !document.parts.length) return;
        const memory = await rebuildDocumentMemory(
            documentId,
            tenantId,
            Math.max(1, document.catalogRevision),
            document.parts,
        );
        console.log(`🧠 Memória técnica ${documentId}: ${memory.chunks} chunks (${memory.embedded} vetorizados).`);
    } catch (memoryError) {
        // Chunks explicam o contexto, mas nunca são a autoridade do Part Number.
        // Uma falha desta camada não pode retirar do balcão peças já extraídas.
        console.warn(`⚠️ Memória técnica auxiliar indisponível para ${documentId}:`, memoryError);
    }
}

export class DocumentWorker {
    static async start(): Promise<void> {
        const channel = rabbitMQ.requireChannel();
        await channel.prefetch(1);
        console.log('👷 Worker de IA aguardando documentos na fila...');

        await channel.consume(DOCUMENT_PROCESSING_QUEUE, async (msg: ConsumeMessage | null) => {
            if (!msg) return;

            let data: DocumentMessage;
            try {
                const parsed: unknown = JSON.parse(msg.content.toString());
                if (!isValidMessage(parsed)) {
                    channel.ack(msg);
                    console.warn('🧹 Mensagem antiga ou inválida removida da fila.');
                    return;
                }
                data = parsed;
            } catch {
                channel.ack(msg);
                console.warn('🧹 Mensagem ilegível removida da fila.');
                return;
            }

            console.log(`📥 Documento recebido: ${data.documentId} (${data.jobId})`);

            try {
                const document = await prisma.document.findUnique({ where: { id: data.documentId } });
                if (!document) {
                    channel.ack(msg);
                    console.warn(`🧹 Documento inexistente ignorado: ${data.documentId}.`);
                    return;
                }
                if (document.tenantId !== data.tenantId) {
                    channel.ack(msg);
                    console.warn(`🧹 Tenant inválido para o documento ${data.documentId}.`);
                    return;
                }
                if (document.processingJobId !== data.jobId) {
                    channel.ack(msg);
                    console.warn(`🧹 Mensagem duplicada/obsoleta ignorada para ${data.documentId}.`);
                    return;
                }

                if (document.status !== 'COMPLETED') {
                    await prisma.document.updateMany({
                        where: { id: data.documentId, processingJobId: data.jobId },
                        data: { status: 'PROCESSING' },
                    });
                }

                await AIService.processDocument(data.documentId, data.tenantId, data.jobId);
                try {
                    const repaired = await repairAutoDetectedDocumentMetadata(data.documentId, data.tenantId);
                    if (repaired.changed) {
                        console.log(`🧭 Metadados automáticos corrigidos para ${data.documentId}: ${JSON.stringify(repaired)}.`);
                    }
                } catch (metadataRepairError) {
                    // Metadado auxiliar nunca deve invalidar Part Numbers já persistidos.
                    console.warn(`⚠️ Não foi possível reconciliar metadados do catálogo ${data.documentId}:`, metadataRepairError);
                }
                await buildAuxiliaryCatalogKnowledge(data.documentId, data.tenantId);
                try {
                    const category = await ensureCatalogCategory(data.documentId, data.tenantId);
                    if (category) console.log(`🗂️ Catálogo ${data.documentId} classificado em ${category}.`);
                } catch (categoryError) {
                    // Organização da biblioteca é auxiliar e nunca deve derrubar um
                    // catálogo que já foi extraído/indexado com sucesso.
                    console.warn(`⚠️ Não foi possível classificar o catálogo ${data.documentId}:`, categoryError);
                }
                try {
                    const health = await refreshCatalogHealth(data.documentId, data.tenantId);
                    if (health) console.log(`🩺 Saúde do catálogo ${data.documentId}: ${health.score}/100 · ${health.reviewStatus}.`);
                } catch (healthError) {
                    console.warn(`⚠️ Não foi possível calcular a saúde do catálogo ${data.documentId}:`, healthError);
                }
                await prisma.document.updateMany({
                    where: { id: data.documentId, processingJobId: data.jobId },
                    data: {
                        status: 'COMPLETED',
                        processingJobId: null,
                    },
                });
                channel.ack(msg);
                console.log(`✅ Documento ${data.documentId} processado com sucesso.`);
            } catch (error) {
                if (error instanceof Error && error.message === 'STALE_DOCUMENT_JOB') {
                    channel.ack(msg);
                    console.warn(`🧹 Trabalho cancelado/obsoleto confirmado para ${data.documentId}.`);
                    return;
                }

                console.error(`❌ Erro ao processar documento ${data.documentId}:`, error);
                const currentDocument = await prisma.document.findUnique({
                    where: { id: data.documentId },
                    select: {
                        processingJobId: true,
                        status: true,
                        processingStage: true,
                        _count: { select: { parts: { where: { active: true } } } },
                    },
                });

                if (!currentDocument || currentDocument.processingJobId !== data.jobId) {
                    channel.ack(msg);
                    console.warn(`🧹 Falha obsoleta ignorada para ${data.documentId}.`);
                    return;
                }

                const hasUsableCatalog = currentDocument.status === 'COMPLETED'
                    && currentDocument._count.parts > 0;
                const retryNumber = nextDocumentRetry(error, msg.properties.headers);

                if (retryNumber !== null) {
                    try {
                        await prisma.document.updateMany({
                            where: { id: data.documentId, processingJobId: data.jobId },
                            data: {
                                processingStage: currentDocument.processingStage === 'INDEXING'
                                    ? 'INDEXING'
                                    : 'RETRYING',
                                processingError: readableProcessingError(error, hasUsableCatalog, true),
                            },
                        });
                        channel.sendToQueue(DOCUMENT_RETRY_QUEUE, msg.content, {
                            persistent: true,
                            contentType: msg.properties.contentType || 'application/json',
                            headers: { ...msg.properties.headers, 'x-retry-count': retryNumber },
                        });
                        await channel.waitForConfirms();
                        channel.ack(msg);
                        console.warn(`🕒 Documento ${data.documentId} reagendado (ciclo ${retryNumber}).`);
                        return;
                    } catch (retryQueueError) {
                        console.error(`❌ Não foi possível reagendar ${data.documentId}:`, retryQueueError);
                    }
                }

                await prisma.document.updateMany({
                    where: { id: data.documentId, processingJobId: data.jobId },
                    data: {
                        status: hasUsableCatalog ? 'COMPLETED' : 'FAILED',
                        processingJobId: null,
                        processingStage: hasUsableCatalog
                            ? (currentDocument.processingStage === 'INDEXING'
                                ? 'READY_WITHOUT_EMBEDDINGS'
                                : 'READY_WITH_WARNING')
                            : 'FAILED',
                        processingError: readableProcessingError(error, hasUsableCatalog, false),
                    },
                });
                if (hasUsableCatalog) {
                    try { await refreshCatalogHealth(data.documentId, data.tenantId); } catch { /* diagnóstico não bloqueia recuperação */ }
                }
                channel.ack(msg);
                console.warn(
                    hasUsableCatalog
                        ? `⚠️ Catálogo ${data.documentId} permanece disponível sem concluir toda a indexação.`
                        : `⚠️ Documento ${data.documentId} marcado como FAILED.`,
                );
            }
        });
    }
}
