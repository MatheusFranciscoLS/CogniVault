import amqp, { ConfirmChannel, ChannelModel } from 'amqplib';

class RabbitMQConnection {
    private connection: ChannelModel | null = null;
    private channel: ConfirmChannel | null = null;
    private lastError: string | null = null;
    private closing = false;

    async connect(): Promise<void> {
        if (this.isReady()) return;

        const url = process.env.RABBITMQ_URL;
        if (!url) throw new Error('RABBITMQ_URL não definida no .env');

        const connection = await amqp.connect(url);
        const channel = await connection.createConfirmChannel();

        await channel.assertQueue('document_processing', { durable: true });

        this.connection = connection;
        this.channel = channel;
        this.lastError = null;

        connection.on('error', (error: Error) => {
            this.lastError = error.message;
            console.error('❌ Erro na conexão RabbitMQ:', error);
        });
        connection.on('close', () => {
            this.connection = null;
            this.channel = null;
            if (!this.closing) {
                this.lastError = 'Conexão com RabbitMQ encerrada inesperadamente.';
                console.error('❌ Conexão com RabbitMQ encerrada inesperadamente.');
            }
        });
        channel.on('error', (error: Error) => {
            this.lastError = error.message;
            console.error('❌ Erro no canal RabbitMQ:', error);
        });
        channel.on('close', () => {
            this.channel = null;
            if (!this.closing) {
                this.lastError = 'Canal do RabbitMQ encerrado inesperadamente.';
                console.error('❌ Canal do RabbitMQ encerrado inesperadamente.');
            }
        });

        console.log('✅ Conectado ao RabbitMQ com sucesso!');
    }

    requireChannel(): ConfirmChannel {
        if (!this.channel) {
            throw new Error('Canal do RabbitMQ não está pronto.');
        }
        return this.channel;
    }

    isReady(): boolean {
        return Boolean(this.connection && this.channel);
    }

    health() {
        return {
            ready: this.isReady(),
            lastError: this.lastError,
        };
    }

    async close(): Promise<void> {
        this.closing = true;

        try {
            await this.channel?.close();
        } finally {
            await this.connection?.close();
            this.channel = null;
            this.connection = null;
        }
    }
}

export const rabbitMQ = new RabbitMQConnection();
