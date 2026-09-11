import 'dotenv/config';
import app from './app';
import { rabbitMQ } from './queues/connection';
import { DocumentWorker } from './queues/worker';
import { prisma } from './config/prisma';
import { retryVisualCatalogsAfterStartup, startVisualCatalogRetryScheduler } from './services/visual-catalog-retry.service';
import { semanticIndexingEnabled } from './services/semantic-indexing-policy';

const PORT = process.env.PORT || 3333;
const BACKGROUND_RETRY_MS = 10_000;

let shuttingDown = false;
let queueStarted = false;
let queueStarting = false;
let backgroundRetryTimer: ReturnType<typeof setTimeout> | undefined;
let stopVisualRetryScheduler: () => void = () => undefined;

function validateCriticalConfiguration(): void {
    if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'test') {
        throw new Error('JWT_SECRET não definida no ambiente. O servidor não pode iniciar sem uma chave de assinatura privada.');
    }
}

async function runPostStartupMaintenance(): Promise<void> {
    try {
        const visualRetry = await retryVisualCatalogsAfterStartup();
        if (visualRetry.queued > 0 || visualRetry.failures > 0) {
            console.log(
                `👁️ PDFs visuais retomados após o intervalo seguro: ${visualRetry.queued}`
                + (visualRetry.failures ? ` · ${visualRetry.failures} falha(s) ao enfileirar` : ''),
            );
        }
        stopVisualRetryScheduler = startVisualCatalogRetryScheduler();
    } catch (error) {
        console.warn('⚠️ Retentativa de PDFs visuais indisponível sem interromper a API:', error);
    }
}

function scheduleBackgroundRetry(): void {
    if (shuttingDown || queueStarted || backgroundRetryTimer) return;
    backgroundRetryTimer = setTimeout(() => {
        backgroundRetryTimer = undefined;
        void startBackgroundProcessing();
    }, BACKGROUND_RETRY_MS);
    backgroundRetryTimer.unref();
}

async function startBackgroundProcessing(): Promise<void> {
    if (shuttingDown || queueStarted || queueStarting) return;
    queueStarting = true;

    try {
        await rabbitMQ.connect(1, 0);
        await DocumentWorker.start();
        queueStarted = true;
        console.log('✅ Processamento assíncrono de PDFs disponível.');
        await runPostStartupMaintenance();
    } catch (error) {
        console.error(
            `⚠️ RabbitMQ/worker indisponível. A API continua online e tentará novamente em ${BACKGROUND_RETRY_MS / 1000}s:`,
            error,
        );
        scheduleBackgroundRetry();
    } finally {
        queueStarting = false;
    }
}

async function bootstrap() {
    validateCriticalConfiguration();
    console.log(`🔎 Busca semântica opcional: ${semanticIndexingEnabled() ? 'ativada com limites de custo' : 'desativada; busca textual preservada'}.`);

    const server = app.listen(PORT, () => {
        console.log(`🚀 Servidor rodando com sucesso na porta ${PORT}`);
        console.log(`✅ Rota de teste: http://localhost:${PORT}/health`);
    });

    void startBackgroundProcessing();

    const shutdown = async (signal: string, exitCode = 0) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`🛑 Encerrando CogniVault com ${signal}...`);

        if (backgroundRetryTimer) {
            clearTimeout(backgroundRetryTimer);
            backgroundRetryTimer = undefined;
        }

        server.close(async () => {
            try {
                stopVisualRetryScheduler();
                await DocumentWorker.stop();
                await rabbitMQ.close();
                await prisma.$disconnect();
                process.exit(exitCode);
            } catch (error) {
                console.error('❌ Falha no encerramento seguro:', error);
                process.exit(1);
            }
        });

        setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.once('SIGINT', () => { void shutdown('SIGINT'); });
    process.once('unhandledRejection', (reason) => {
        console.error('❌ Rejeição de Promise não tratada; reiniciando processo:', reason);
        void shutdown('unhandledRejection', 1);
    });
    process.once('uncaughtException', (error) => {
        console.error('❌ Exceção não tratada; reiniciando processo:', error);
        void shutdown('uncaughtException', 1);
    });
}

void bootstrap().catch((error) => {
    console.error('❌ Erro crítico ao iniciar o servidor HTTP:', error);
    process.exit(1);
});
