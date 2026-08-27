import { rabbitMQ } from './connection';
import { prisma } from '../config/prisma';
import { AIService } from '../services/ai.service';

interface DocumentMessage {
    documentId: string;
    tenantId: string;
}

export class DocumentWorker {

    static async start(): Promise<void> {

        const channel = rabbitMQ.channel;

        if (!channel) {
            throw new Error(
                'Canal do RabbitMQ não iniciado para o Worker.'
            );
        }

        // =========================================================
        // PROCESSAR APENAS UM DOCUMENTO POR VEZ
        // =========================================================

        await channel.prefetch(1);

        console.log(
            '👷 Worker de IA aguardando documentos na fila...'
        );

        await channel.consume(
            'document_processing',
            async (msg: any) => {

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
                    // 4. MARCAR COMO FAILED
                    // =================================================

                    try {

                        await prisma.document.update({
                            where: {
                                id: data.documentId
                            },
                            data: {
                                status: 'FAILED'
                            }
                        });

                        console.log(
                            `⚠️ Documento ${data.documentId} marcado como FAILED.`
                        );

                    } catch (dbError) {

                        console.error(
                            `❌ Não foi possível marcar documento ${data.documentId} como FAILED:`,
                            dbError
                        );
                    }

                    // =================================================
                    // 5. DESCARTAR MENSAGEM
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
