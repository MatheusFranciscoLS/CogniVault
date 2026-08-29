import 'dotenv/config';
import app from './app';
import { rabbitMQ } from './queues/connection';
import { DocumentWorker } from './queues/worker';
import { prisma } from './config/prisma';
import { cleanupLegacyTestDocuments } from './services/legacy-test-cleanup';

const PORT = process.env.PORT || 3333;

async function bootstrap() {
    try {
        // 1. Conecta ao RabbitMQ
        await rabbitMQ.connect();

        // 2. Remove somente os registros de teste legados identificados na auditoria.
        // A limpeza é idempotente, usa IDs conhecidos e valida o formato vazio antes de excluir.
        try {
            const cleanup = await cleanupLegacyTestDocuments();
            if (cleanup.deleted > 0) {
                console.log(`🧹 Limpeza legada concluída: ${cleanup.deleted} registro(s) de teste removido(s).`);
            }
            if (cleanup.skipped.length > 0) {
                console.warn(`⚠️ Limpeza legada preservou ${cleanup.skipped.length} registro(s) por não corresponderem mais ao formato de teste.`);
            }
        } catch (cleanupError) {
            // Manutenção não crítica nunca deve derrubar a API.
            console.warn('⚠️ Limpeza legada não executada; inicialização seguirá normalmente:', cleanupError);
        }

        // 3. Inicia o operário de processamento dos catálogos.
        await DocumentWorker.start();

        // 4. Inicia o servidor web.
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
