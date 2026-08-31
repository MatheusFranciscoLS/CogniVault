import 'dotenv/config';
import app from './app';
import { rabbitMQ } from './queues/connection';
import { DocumentWorker } from './queues/worker';
import { prisma } from './config/prisma';
import { refreshLegacyCatalogHealth } from './services/catalog-health-maintenance';
import { retryVisualCatalogsAfterStartup, startVisualCatalogRetryScheduler } from './services/visual-catalog-retry.service';
import { semanticIndexingEnabled } from './services/semantic-indexing-policy';

const PORT = process.env.PORT || 3333;

async function bootstrap() {
    let stopVisualRetryScheduler: () => void = () => undefined;
    try {
        await rabbitMQ.connect();
        await DocumentWorker.start();

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

        const visualRetry = await retryVisualCatalogsAfterStartup();
        if (visualRetry.queued > 0 || visualRetry.failures > 0) {
            console.log(
                `👁️ PDFs visuais retomados após o intervalo seguro: ${visualRetry.queued}`
                + (visualRetry.failures ? ` · ${visualRetry.failures} falha(s) ao enfileirar` : ''),
            );
        }
        stopVisualRetryScheduler = startVisualCatalogRetryScheduler();
        console.log(`🔎 Busca semântica opcional: ${semanticIndexingEnabled() ? 'ativada com limites de custo' : 'desativada; busca textual preservada'}.`);

        const server = app.listen(PORT, () => {
            console.log(`🚀 Servidor rodando com sucesso na porta ${PORT}`);
            console.log(`✅ Rota de teste: http://localhost:${PORT}/health`);
        });

        let shuttingDown = false;
        const shutdown = async (signal: string) => {
            if (shuttingDown) return;
            shuttingDown = true;
            console.log(`🛑 Encerrando CogniVault com ${signal}...`);

            server.close(async () => {
                try {
                    stopVisualRetryScheduler();
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
    } catch (error) {
        console.error('❌ Erro crítico ao iniciar o servidor:', error);
        process.exit(1);
    }
}

bootstrap();
