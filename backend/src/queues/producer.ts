import { DOCUMENT_PROCESSING_QUEUE, rabbitMQ } from './connection';

export class DocumentProducer {
    static async publishToQueue(documentId: string, tenantId: string) {
        const channel = rabbitMQ.requireChannel();

        // Transforma os dados em texto para trafegar na rede
        const message = JSON.stringify({ documentId, tenantId });

        // Envia a mensagem para a fila 'document_processing'
        channel.sendToQueue(DOCUMENT_PROCESSING_QUEUE, Buffer.from(message), {
            persistent: true // Garante que a mensagem não suma se o servidor reiniciar
        });
        await channel.waitForConfirms();

        console.log(`📤 Documento ${documentId} colocado na fila com sucesso!`);
    }
}

