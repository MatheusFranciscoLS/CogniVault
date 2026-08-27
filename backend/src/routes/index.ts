import { Router } from 'express';
import multer from 'multer';

import { DocumentController } from '../controllers/document.controller';
import { ChatController } from '../controllers/chat.controller';
import { AuthController } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

const documentController = new DocumentController();
const chatController = new ChatController();
const authController = new AuthController();

const upload = multer({
    dest: 'uploads/'
});

// =========================================================
// ROTAS PÚBLICAS
// =========================================================

router.post(
    '/register',
    (req, res) => authController.register(req, res)
);

router.post(
    '/login',
    (req, res) => authController.login(req, res)
);

// =========================================================
// ROTAS PROTEGIDAS
// =========================================================

// Upload de catálogo
router.post(
    '/upload',
    authMiddleware,
    upload.single('file'),
    (req, res) => documentController.upload(req, res)
);

// Perguntas para a IA
router.post(
    '/chat',
    authMiddleware,
    (req, res) => chatController.ask(req, res)
);

export default router;
