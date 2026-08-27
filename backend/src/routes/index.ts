import { Router } from 'express';
import multer from 'multer';
import { DocumentController } from '../controllers/document.controller';
import { ChatController } from '../controllers/chat.controller';
import { AuthController } from '../controllers/auth.controller'; // 👈 Importando o porteiro

const router = Router();
const documentController = new DocumentController();
const chatController = new ChatController();
const authController = new AuthController(); // 👈 Inicializando

const upload = multer({ dest: 'uploads/' });

// ==========================================
// ROTAS PÚBLICAS (A "Portaria")
// ==========================================
router.post('/register', (req, res) => authController.register(req, res));
router.post('/login', (req, res) => authController.login(req, res));

// ==========================================
// ROTAS DO SISTEMA (Em breve serão trancadas)
// ==========================================
router.post('/upload', upload.single('file'), (req, res) => documentController.upload(req, res));
router.post('/chat', (req, res) => chatController.ask(req, res));

export default router;