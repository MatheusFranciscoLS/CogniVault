import amqp, { ConfirmChannel, ChannelModel } from 'amqplib';

export const DOCUMENT_PROCESSING_QUEUE = 'document_processing';
export const DOCUMENT_RETRY_QUEUE = 'document_processing_retry_60s';

class RabbitMQConnection {
    private connection: ChannelModel | null = null;
    private channel: ConfirmChannel | null = null;
    private lastError: string | null = null;
    private closing = false;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private reconnectListeners: Array<() => void | Promise<void>> = [];
    private connectingPromise: Promise<void> | null = null;

    async connect(retries = 5, delayMs = 2000): Promise<void> {
        if (this.isReady()) return;
        if (this.connectingPromise) return this.connectingPromise;

        this.connectingPromise = this.performConnect(retries, delayMs);
        try {
            await this.connectingPromise;
        } finally {
            this.connectingPromise = null;
        }
    }

    private async performConnect(retries: number, delayMs: number): Promise<void> {
        const url = process.env.RABBITMQ_URL;
        if (!url) throw new Error('RABBITMQ_URL não definida no .env');

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // Heartbeat de 20s impede que firewalls da nuvem (Render, CloudAMQP) matem o socket TCP por inatividade
                const amqpUrl = url.includes('heartbeat=')
                    ? url
                    : (url.includes('?') ? `${url}&heartbeat=20` : `${url}?heartbeat=20`);
                const connection = await amqp.connect(amqpUrl);
                const channel = await connection.createConfirmChannel();

                await channel.assertQueue(DOCUMENT_PROCESSING_QUEUE, { durable: true });
                await channel.assertQueue(DOCUMENT_RETRY_QUEUE, {
                    durable: true,
                    arguments: {
                        'x-message-ttl': 60_000,
                        'x-dead-letter-exchange': '',
                        'x-dead-letter-routing-key': DOCUMENT_PROCESSING_QUEUE,
                    },
                });

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
                        console.error('❌ Conexão com RabbitMQ encerrada inesperadamente. Agendando reconexão...');
                        this.scheduleReconnect();
                    }
                });
                channel.on('error', (error: Error) => {
                    this.lastError = error.message;
                    console.error('❌ Erro no canal RabbitMQ:', error);
                    if (!this.closing) {
                        this.scheduleReconnect();
                    }
                });
                channel.on('close', () => {
                    this.channel = null;
                    if (!this.closing) {
                        this.lastError = 'Canal do RabbitMQ encerrado inesperadamente.';
                        console.error('❌ Canal do RabbitMQ encerrado inesperadamente. Agendando reconexão...');
                        this.scheduleReconnect();
                    }
                });

                console.log('✅ Conectado ao RabbitMQ com sucesso!');
                this.notifyReconnect();
                return;
            } catch (err) {
                this.lastError = err instanceof Error ? err.message : String(err);
                if (attempt < retries) {
                    console.warn(`⚠️ Tentativa ${attempt}/${retries} de conexão ao RabbitMQ falhou (${this.lastError}). Nova tentativa em ${delayMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                } else {
                    throw err;
                }
            }
        }
    }

    onReconnect(listener: () => void | Promise<void>): void {
        this.reconnectListeners.push(listener);
    }

    private scheduleReconnect(): void {
        if (this.closing || this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            try {
                console.log('🔄 Tentando restabelecer conexão com o RabbitMQ...');
                await this.connect(1, 0);
            } catch {
                this.scheduleReconnect();
            }
        }, 5000);
        this.reconnectTimer.unref();
    }

    private notifyReconnect(): void {
        for (const listener of this.reconnectListeners) {
            try {
                void listener();
            } catch (err) {
                console.error('❌ Erro no listener de reconexão RabbitMQ:', err);
            }
        }
    }

    requireChannel(): ConfirmChannel {
        if (!this.channel) {
            throw new Error('Canal do RabbitMQ não está pronto.');
        }
        return this.channel;
    }

    async getOrWaitForChannel(timeoutMs = 5000): Promise<ConfirmChannel> {
        if (this.channel) return this.channel;

        if (!this.closing && !this.isReady()) {
            void this.connect(1, 0).catch(() => {});
        }

        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (this.channel) return this.channel;
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        if (this.channel) return this.channel;
        throw new Error('Canal do RabbitMQ não está pronto após aguardar reconexão.');
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
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

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

