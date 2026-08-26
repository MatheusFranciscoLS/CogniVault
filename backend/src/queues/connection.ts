import amqp from 'amqplib';

class RabbitMQConnection {
    // Usamos 'any' para driblar o bug de tipagem da biblioteca @types/amqplib
    public connection: any;
    public channel: any;

    async connect(): Promise<void> {
        try {
            const url = process.env.RABBITMQ_URL;
            if (!url) throw new Error('RABBITMQ_URL não definida no .env');

            this.connection = await amqp.connect(url);
            this.channel = await this.connection.createChannel();

            await this.channel.assertQueue('document_processing', { durable: true });
            console.log('✅ Conectado ao RabbitMQ com sucesso!');
        } catch (error) {
            console.error('❌ Erro no RabbitMQ:', error);
        }
    }
}

export const rabbitMQ = new RabbitMQConnection();