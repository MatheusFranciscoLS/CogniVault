import 'dotenv/config';
import app from './app';
import { rabbitMQ } from './queues/connection';
import { DocumentWorker } from './queues/worker';
import { prisma } from './config/prisma';
import { refreshLegacyCatalogHealth } from './services/catalog-health-maintenance';
import { retryVisualCatalogsAfterStartup, startVisualCatalogRetryScheduler } from './services/visual-catalog-retry.service';
import { semanticIndexingEnabled } from './services/semantic-indexing-policy';

const PORT = process.env.PORT || 3333;
const BACKGROUND_RETRY_MS = 10_000;

let shuttingDown = false;
let queueStarted = false;
let queueStarting = false;
let backgroundRetryTimer: ReturnType<typeof setTimeout> | undefined;
let stopVisualRetryScheduler: () => void = () => undefined;

async function runPostStartupMaintenance(): Promise<void> {
    try {
        const catalogHealthMaintenance = await refreshLegacyCatalogHealth();
        if (catalogHealthMaintenance.found > 0) {
            console.log(
                `🩺 Diagnósticos legados recalculados: ${catalogHealthMaintenance.refreshed}/${catalogHealthMaintenance.found}`
                + (catalogHealthMaintenance.failed ? ` · ${catalogHealthMaintenance.failed} falha(s)` : ''),
            );
        }
        if (catalogHealthMaintenance.reextractQueued > 0 || catalogHealthMaintenance.reextractFailed > 0) {
            console.log(
                `🛠️ Correções de extração reenfileiradas: ${catalogHealthMaintenance.reextractQueued}`
                + (catalogHealthMaintenance.reextractFailed ? ` · ${catalogHealthMaintenance.reextractFailed} falha(s)` : ''),
            );
        }
    } catch (error) {
        console.warn('⚠️ Manutenção de saúde dos catálogos falhou sem interromper a API:', error);
    }

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
        // Uma falha temporária da fila não deve derrubar busca/login/banco.
        // A primeira tentativa é curta; se falhar, repetimos em background.
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
    console.log(`🔎 Busca semântica opcional: ${semanticIndexingEnabled() ? 'ativada com limites de custo' : 'desativada; busca textual preservada'}.`);

    // O HTTP sobe primeiro. Assim login, busca e consultas ao PostgreSQL continuam
    // disponíveis mesmo se a infraestrutura de processamento de PDFs estiver fora.
    const server = app.listen(PORT, () => {
        console.log(`🚀 Servidor rodando com sucesso na porta ${PORT}`);
        console.log(`✅ Rota de teste: http://localhost:${PORT}/health`);
    });

    void startBackgroundProcessing();

    const shutdown = async (signal: string) => {
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
                process.exit(0);
            } catch (error) {
                console.error('❌ Falha no encerramento seguro:', error);
                process.exit(1);
            }
        });

        setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.once('SIGINT', () => { void shutdown('SIGINT'); });
}

process.on('unhandledRejection', (reason) => {
    console.error('❌ Rejeição de Promise não tratada:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Exceção não tratada:', error);
});

void bootstrap().catch((error) => {
    console.error('❌ Erro crítico ao iniciar o servidor HTTP:', error);
    process.exit(1);
});
