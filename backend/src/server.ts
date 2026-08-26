import 'dotenv/config';
import app from './app';
import { rabbitMQ } from './queues/connection';
import { DocumentWorker } from './queues/worker'; // Nova importação

const PORT = process.env.PORT || 3333;

async function bootstrap() {
    try {
        // 1. Conecta ao RabbitMQ
        await rabbitMQ.connect();

        // 2. Inicia o Operário da Inteligência Artificial
        await DocumentWorker.start();

        // 3. Inicia o servidor web
        app.listen(PORT, () => {
            console.log(`🚀 Servidor rodando com sucesso na porta ${PORT}`);
            console.log(`✅ Rota de teste: http://localhost:${PORT}/health`);
        });
    } catch (error) {
        console.error('❌ Erro crítico ao iniciar o servidor:', error);
        process.exit(1);
    }
}

bootstrap();