import type { ConsumeMessage, Channel } from 'amqplib';
import { prisma } from '../config/prisma';
import { AIService } from '../services/ai.service';
import { ensureCatalogCategory } from '../services/catalog-category-assignment';
import { refreshCatalogHealth } from '../services/catalog-health';
import { rebuildDocumentMemory } from '../services/document-memory';
import { invalidateHomeCountsCache } from '../controllers/operational.controller';
import { invalidateFastSearchCaches } from '../controllers/fast-search.controller';
import { invalidateCatalogListCache } from '../controllers/catalog-list.controller';
import { invalidateNotificationCache } from '../controllers/notification.controller';
import { invalidateAdminOverviewCache } from '../controllers/admin-overview.controller';
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

function invalidateCatalogRuntimeCaches(tenantId: string): void {
    invalidateHomeCountsCache(tenantId);
    invalidateFastSearchCaches(tenantId);
    invalidateCatalogListCache(tenantId);
    invalidateNotificationCache(tenantId);
    invalidateAdminOverviewCache(tenantId);
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
            { allowProcessing: true },
        );
        console.log(`🧠 Memória técnica ${documentId}: ${memory.chunks} chunks (${memory.embedded} vetorizados).`);
    } catch (memoryError) {
        console.warn(`⚠️ Memória técnica auxiliar indisponível para ${documentId}:`, memoryError);
    }
}

let reconnectHookRegistered = false;

export class DocumentWorker {
    private static activeJobs = 0;
    private static isShuttingDown = false;
    private static channel?: Channel;
    private static consumerTag?: string;

    static async start(): Promise<void> {
        this.isShuttingDown = false;
        if (!reconnectHookRegistered) {
            reconnectHookRegistered = true;
            rabbitMQ.onReconnect(async () => {
                console.log('👷 Reiniciando consumo de mensagens no DocumentWorker após reconexão com RabbitMQ...');
                await DocumentWorker.start().catch((err) => {
                    console.error('❌ Falha ao reiniciar DocumentWorker após reconexão:', err);
                });
            });
        }

        const channel = rabbitMQ.requireChannel();
        this.channel = channel;
        await channel.prefetch(1);
        console.log('👷 Worker de IA aguardando documentos na fila...');

        const consumeResult = await channel.consume(DOCUMENT_PROCESSING_QUEUE, async (msg: ConsumeMessage | null) => {
            if (!msg) return;
            if (this.isShuttingDown) {
                channel.nack(msg);
                return;
            }

            this.activeJobs += 1;
            let messageSettled = false;

            const ack = (): void => {
                if (messageSettled) return;
                channel.ack(msg);
                messageSettled = true;
            };
            const requeue = (): void => {
                if (messageSettled) return;
                channel.nack(msg, false, true);
                messageSettled = true;
            };

            try {
                let data: DocumentMessage;
                try {
                    const parsed: unknown = JSON.parse(msg.content.toString());
                    if (!isValidMessage(parsed)) {
                        ack();
                        console.warn('🧹 Mensagem antiga ou inválida removida da fila.');
                        return;
                    }
                    data = parsed;
                } catch {
                    ack();
                    console.warn('🧹 Mensagem ilegível removida da fila.');
                    return;
                }

                console.log(`📥 Documento recebido: ${data.documentId} (${data.jobId})`);

                try {
                    const document = await prisma.document.findUnique({ where: { id: data.documentId } });
                    if (!document) {
                        ack();
                        console.warn(`🧹 Documento inexistente ignorado: ${data.documentId}.`);
                        return;
                    }
                    if (document.tenantId !== data.tenantId) {
                        ack();
                        console.warn(`🧹 Tenant inválido para o documento ${data.documentId}.`);
                        return;
                    }
                    if (document.processingJobId !== data.jobId) {
                        ack();
                        console.warn(`🧹 Mensagem duplicada/obsoleta ignorada para ${data.documentId}.`);
                        return;
                    }

                    if (document.status !== 'COMPLETED') {
                        await prisma.document.updateMany({
                            where: { id: data.documentId, processingJobId: data.jobId },
                            data: { status: 'PROCESSING' },
                        });
                        invalidateCatalogListCache(data.tenantId);
                        invalidateNotificationCache(data.tenantId);
                        invalidateAdminOverviewCache(data.tenantId);
                    }

                    await AIService.processDocument(data.documentId, data.tenantId, data.jobId);
                    await buildAuxiliaryCatalogKnowledge(data.documentId, data.tenantId);
                    try {
                        const category = await ensureCatalogCategory(data.documentId, data.tenantId);
                        if (category) console.log(`🗂️ Catálogo ${data.documentId} classificado em ${category}.`);
                    } catch (categoryError) {
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
                    invalidateCatalogRuntimeCaches(data.tenantId);
                    ack();
                    console.log(`✅ Documento ${data.documentId} processado com sucesso.`);
                } catch (error) {
                    if (error instanceof Error && error.message === 'STALE_DOCUMENT_JOB') {
                        ack();
                        console.warn(`🧹 Trabalho cancelado/obsoleto confirmado para ${data.documentId}.`);
                        return;
                    }

                    console.error(`❌ Erro ao processar documento ${data.documentId}:`, error);
                    try {
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
                            ack();
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
                                invalidateCatalogListCache(data.tenantId);
                                channel.sendToQueue(DOCUMENT_RETRY_QUEUE, msg.content, {
                                    persistent: true,
                                    contentType: msg.properties.contentType || 'application/json',
                                    headers: { ...msg.properties.headers, 'x-retry-count': retryNumber },
                                });
                                await channel.waitForConfirms();
                                ack();
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
                        invalidateCatalogRuntimeCaches(data.tenantId);
                        ack();
                        console.warn(
                            hasUsableCatalog
                                ? `⚠️ Catálogo ${data.documentId} permanece disponível sem concluir toda a indexação.`
                                : `⚠️ Documento ${data.documentId} marcado como FAILED.`,
                        );
                    } catch (recoveryError) {
                        console.error(`❌ Falha ao recuperar o job ${data.documentId}; mensagem será devolvida à fila:`, recoveryError);
                        requeue();
                    }
                }
            } catch (fatalHandlerError) {
                console.error('❌ Falha inesperada no consumidor de documentos; mensagem será devolvida à fila:', fatalHandlerError);
                try {
                    requeue();
                } catch (settleError) {
                    console.error('❌ Não foi possível devolver a mensagem ao RabbitMQ:', settleError);
                }
            } finally {
                this.activeJobs = Math.max(0, this.activeJobs - 1);
                if (!messageSettled) {
                    try {
                        requeue();
                    } catch (settleError) {
                        console.error('❌ Mensagem terminou sem ack/nack e não pôde ser devolvida à fila:', settleError);
                    }
                }
            }
        });
        
        this.consumerTag = consumeResult.consumerTag;
    }

    static async stop(): Promise<void> {
        this.isShuttingDown = true;
        console.log('🛑 Solicitando parada do DocumentWorker...');
        if (this.channel && this.consumerTag) {
            try {
                await this.channel.cancel(this.consumerTag);
                console.log('🛑 Consumidor do DocumentWorker cancelado. Nenhuma nova mensagem será recebida.');
            } catch (err) {
                console.warn('⚠️ Falha ao cancelar consumidor do RabbitMQ:', err);
            }
        }

        let attempts = 0;
        while (this.activeJobs > 0 && attempts < 30) {
            console.log(`⏳ Aguardando ${this.activeJobs} trabalho(s) em andamento finalizarem... (${attempts + 1}/30)`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }

        if (this.activeJobs > 0) {
            console.warn(`⚠️ O DocumentWorker está sendo forçado a parar com ${this.activeJobs} trabalho(s) pendente(s).`);
        } else {
            console.log('✅ DocumentWorker parado graciosamente.');
        }
    }
}
