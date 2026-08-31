import 'dotenv/config';
import app from './app';
import { rabbitMQ } from './queues/connection';
import { DocumentWorker } from './queues/worker';
import { prisma } from './config/prisma';
import { refreshLegacyCatalogHealth } from './services/catalog-health-maintenance';

const PORT = process.env.PORT || 3333;

async function bootstrap() {
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
