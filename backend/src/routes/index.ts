import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller';
import { ChatController } from '../controllers/chat.controller';

const router = Router();
const documentController = new DocumentController();
const chatController = new ChatController(); // Inicializamos o chat

// Nossa porta de entrada para enviar PDFs
router.post('/upload', documentController.upload);

// Nossa porta de entrada para fazer perguntas à IA
router.post('/chat', chatController.ask);

export default router;