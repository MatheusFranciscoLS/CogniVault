import express from 'express';
import cors from 'cors';
import routes from './routes';

const app = express();

// Middlewares essenciais
app.use(cors());
app.use(express.json());

// Engata todas as rotas que criamos (como o /upload) no caminho /api
app.use('/api', routes);

// Rota de saúde para checarmos facilmente pelo navegador se a API está de pé
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        message: 'CogniVault API está rodando perfeitamente!'
    });
});

export default app;