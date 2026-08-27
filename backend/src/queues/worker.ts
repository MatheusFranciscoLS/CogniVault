import { rabbitMQ } from './connection';
import { prisma } from '../config/prisma';
import { services } from '../services/ai.service';

export class DocumentWorker {
    static async start(): Promise<void> {
        const channel = rabbitMQ.channel;
        if (!channel) throw new Error('Canal do RabbitMQ não iniciado para o Worker.');

        console.log('👷 Worker de IA aguardando documentos na fila...');

        // Começa a escutar a fila "document_processing"
        channel.consume('document_processing', async (msg: any) => {
            if (msg !== null) {
                const data = JSON.parse(msg.content.toString());
                console.log(`📥 Novo documento recebido na fila: ${data.documentId}`);

                try {
                    // 1. Atualiza o status no banco para "PROCESSANDO"
                    await prisma.document.update({
                        where: { id: data.documentId },
                        data: { status: 'PROCESSING' }
                    });

                    // 2. Manda o documento para o cérebro (Google Gemini)
                    await AIService.processDocument(data.documentId, data.tenantId);

                    // 3. Atualiza o status no banco para "CONCLUÍDO"
                    await prisma.document.update({
                        where: { id: data.documentId },
                        data: { status: 'COMPLETED' }
                    });

                    console.log(`✅ Documento ${data.documentId} processado com sucesso!`);

                    // Avisa o RabbitMQ que o trabalho terminou e pode apagar a mensagem
                    channel.ack(msg);
                } catch (error) {
                    console.error(`❌ Erro ao processar documento ${data.documentId}:`, error);

                    await prisma.document.update({
                        where: { id: data.documentId },
                        data: { status: 'FAILED' }
                    });

                    // Em caso de erro, tira da fila para não travar o sistema
                    channel.nack(msg, false, false);
                }
            }
        });
    }
}