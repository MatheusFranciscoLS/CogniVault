import { DOCUMENT_PROCESSING_QUEUE, DOCUMENT_RETRY_QUEUE, rabbitMQ } from './connection';
import { prisma } from '../config/prisma';
import { AIService } from '../services/ai.service';
import type { ConsumeMessage } from 'amqplib';
import { nextDocumentRetry } from '../utils/document-retry';

interface DocumentMessage {
    documentId: string;
    tenantId: string;
}

export class DocumentWorker {

    static async start(): Promise<void> {

        const channel = rabbitMQ.requireChannel();

        // =========================================================
        // PROCESSAR APENAS UM DOCUMENTO POR VEZ
        // =========================================================

        await channel.prefetch(1);

        console.log(
            '👷 Worker de IA aguardando documentos na fila...'
        );

        await channel.consume(
            DOCUMENT_PROCESSING_QUEUE,
            async (msg: ConsumeMessage | null) => {

                if (!msg) {
                    return;
                }

                // =====================================================
                // 1. LER MENSAGEM
                // =====================================================

                let data: DocumentMessage;

                try {

                    data = JSON.parse(
                        msg.content.toString()
                    );

                } catch (error) {

                    console.error(
                        '❌ Mensagem inválida recebida pelo Worker.'
                    );

                    channel.nack(
                        msg,
                        false,
                        false
                    );

                    return;
                }

                // =====================================================
                // 2. VALIDAR MENSAGEM
                // =====================================================

                if (
                    typeof data.documentId !== 'string' ||
                    !data.documentId.trim() ||
                    typeof data.tenantId !== 'string' ||
                    !data.tenantId.trim()
                ) {

                    console.error(
                        '❌ Mensagem do Worker sem documentId ou tenantId válido:',
                        data
                    );

                    channel.nack(
                        msg,
                        false,
                        false
                    );

                    return;
                }

                console.log(
                    `📥 Documento recebido: ${data.documentId}`
                );

                console.log(
                    `🏢 Tenant: ${data.tenantId}`
                );

                // =====================================================
                // 3. PROCESSAMENTO
                // =====================================================

                let preserveCatalogOnFailure = false;
                let canUpdateDocumentStatus = false;

                try {

                    // =================================================
                    // 3.1 BUSCAR DOCUMENTO
                    // =================================================

                    const document =
                        await prisma.document.findUnique({
                            where: {
                                id: data.documentId
                            }
                        });

                    if (!document) {

                        throw new Error(
                            `Documento ${data.documentId} não encontrado no banco.`
                        );
                    }

                    // =================================================
                    // 3.2 VALIDAR TENANT
                    // =================================================

                    if (
                        document.tenantId !==
                        data.tenantId
                    ) {

                        throw new Error(
                            `Documento ${data.documentId} não pertence ao tenant ${data.tenantId}.`
                        );
                    }

                    // =================================================
                    // 3.3 STATUS PROCESSANDO
                    // =================================================

                    const hasUsableCatalog = document.status === 'COMPLETED';
                    preserveCatalogOnFailure = hasUsableCatalog;

                    if (!hasUsableCatalog) {
                        await prisma.document.update({
                            where: {
                                id: data.documentId
                            },
                            data: {
                                status: 'PROCESSING'
                            }
                        });

                        console.log(
                            `⚙️ Documento ${data.documentId} marcado como PROCESSING.`
                        );
                    } else {
                        console.log(
                            `♻️ Reprocessando ${data.documentId} sem retirar o catálogo atual de uso.`
                        );
                    }

                    canUpdateDocumentStatus = true;

                    // =================================================
                    // 3.4 PROCESSAR COM IA
                    // =================================================

                    await AIService.processDocument(
                        data.documentId,
                        data.tenantId
                    );

                    // =================================================
                    // 3.5 STATUS CONCLUÍDO
                    // =================================================

                    await prisma.document.update({
                        where: {
                            id: data.documentId
                        },
                        data: {
                            status: 'COMPLETED'
                        }
                    });

                    console.log(
                        `✅ Documento ${data.documentId} processado com sucesso!`
                    );

                    // =================================================
                    // 3.6 CONFIRMAR RABBITMQ
                    // =================================================

                    channel.ack(msg);

                    console.log(
                        `📤 Mensagem do documento ${data.documentId} confirmada no RabbitMQ.`
                    );

                } catch (error) {

                    console.error(
                        `❌ Erro ao processar documento ${data.documentId}:`,
                        error
                    );

                    // =================================================
                    // 4. REAGENDAR INDISPONIBILIDADE TEMPORÁRIA
                    //
                    // A fila auxiliar retém a mensagem por 60 segundos
                    // e depois a devolve à fila principal. O contador
                    // limita os ciclos para impedir repetição infinita.
                    // =================================================

                    const retryNumber = nextDocumentRetry(
                        error,
                        msg.properties.headers
                    );

                    if (retryNumber !== null) {
                        try {
                            channel.sendToQueue(
                                DOCUMENT_RETRY_QUEUE,
                                msg.content,
                                {
                                    persistent: true,
                                    contentType: msg.properties.contentType || 'application/json',
                                    headers: {
                                        ...msg.properties.headers,
                                        'x-retry-count': retryNumber,
                                    },
                                }
                            );
                            await channel.waitForConfirms();
                            channel.ack(msg);

                            console.warn(
                                `🕒 Documento ${data.documentId} reagendado para nova tentativa em 60 segundos (ciclo ${retryNumber}).`
                            );
                            return;
                        } catch (retryQueueError) {
                            console.error(
                                `❌ Não foi possível reagendar o documento ${data.documentId}:`,
                                retryQueueError
                            );
                        }
                    }

                    // =================================================
                    // 5. MARCAR COMO FAILED
                    // =================================================

                    try {
                        if (canUpdateDocumentStatus) {
                            await prisma.document.update({
                                where: {
                                    id: data.documentId
                                },
                                data: {
                                    status: preserveCatalogOnFailure ? 'COMPLETED' : 'FAILED'
                                }
                            });

                            console.log(
                                preserveCatalogOnFailure
                                    ? `⚠️ Reprocessamento de ${data.documentId} falhou; catálogo anterior preservado.`
                                    : `⚠️ Documento ${data.documentId} marcado como FAILED.`
                            );
                        }

                    } catch (dbError) {

                        console.error(
                            `❌ Não foi possível marcar documento ${data.documentId} como FAILED:`,
                            dbError
                        );
                    }

                    // =================================================
                    // 6. DESCARTAR MENSAGEM
                    //
                    // false = não requeue
                    // =================================================

                    channel.nack(
                        msg,
                        false,
                        false
                    );

                    console.log(
                        `🗑️ Mensagem do documento ${data.documentId} removida da fila.`
                    );
                }
            }
        );
    }
}

