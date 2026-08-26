import { rabbitMQ } from './connection';

export class DocumentProducer {
    static async publishToQueue(documentId: string, tenantId: string) {
        const channel = rabbitMQ.channel;
        if (!channel) throw new Error('Canal do RabbitMQ não está pronto.');

        // Transforma os dados em texto para trafegar na rede
        const message = JSON.stringify({ documentId, tenantId });

        // Envia a mensagem para a fila 'document_processing'
        channel.sendToQueue('document_processing', Buffer.from(message), {
            persistent: true // Garante que a mensagem não suma se o servidor reiniciar
        });

        console.log(`📤 Documento ${documentId} colocado na fila com sucesso!`);
    }
}