import type { ConsumeMessage } from 'amqplib';
import { prisma } from '../config/prisma';
import { AIService } from '../services/ai.service';
import { ensureCatalogCategory } from '../services/catalog-category-assignment';
import { nextDocumentRetry } from '../utils/document-retry';
import { DOCUMENT_PROCESSING_QUEUE, DOCUMENT_RETRY_QUEUE, rabbitMQ } from './connection';

interface DocumentMessage {
    documentId: string;
    tenantId: string;
    jobId: string;
}

function readableProcessingError(error: unknown, hasUsableCatalog: boolean): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
        return hasUsableCatalog
            ? 'As peças já gravadas foram preservadas. A IA opcional atingiu o limite temporário, sem bloquear o catálogo.'
            : 'Este PDF não possui uma tabela textual reconhecível e precisa de leitura visual. A cota diária da IA foi atingida; tente novamente após a renovação da cota ou envie o IPL oficial com texto pesquisável.';
    }
    return message.slice(0, 600);
}

function isValidMessage(value: unknown): value is DocumentMessage {
    if (!value || typeof value !== 'object') return false;
    const message = value as Record<string, unknown>;
    return [message.documentId, message.tenantId, message.jobId]
        .every((item) => typeof item === 'string' && item.trim().length > 0);
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
                    const category = await ensureCatalogCategory(data.documentId, data.tenantId);
                    if (category) console.log(`🗂️ Catálogo ${data.documentId} classificado em ${category}.`);
                } catch (categoryError) {
                    // Organização da biblioteca é auxiliar e nunca deve derrubar um
                    // catálogo que já foi extraído/indexado com sucesso.
                    console.warn(`⚠️ Não foi possível classificar o catálogo ${data.documentId}:`, categoryError);
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
                                processingError: readableProcessingError(error, hasUsableCatalog),
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
                        processingError: readableProcessingError(error, hasUsableCatalog),
                    },
                });
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
