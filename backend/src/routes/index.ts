import { Router } from 'express';
import multer from 'multer';

import { DocumentController } from '../controllers/document.controller';
import { ChatController } from '../controllers/chat.controller';
import { AuthController } from '../controllers/auth.controller';
import { FeedbackController } from '../controllers/feedback.controller';
import { AdminController } from '../controllers/admin.controller';
import { authMiddleware, adminOnly } from '../middleware/auth.middleware';

const router = Router();

const documentController = new DocumentController();
const chatController = new ChatController();
const authController = new AuthController();
const feedbackController = new FeedbackController();
const adminController = new AdminController();

const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 },
});

router.post('/login', (req, res) => authController.login(req, res));

router.get('/me', authMiddleware, (req, res) => adminController.me(req, res));

router.get('/documents', authMiddleware, (req, res) => documentController.list(req, res));
router.get('/documents/:id/access', authMiddleware, (req, res) => documentController.access(req, res));

router.post(
    '/upload',
    authMiddleware,
    adminOnly,
    upload.single('file'),
    (req, res) => documentController.upload(req, res),
);
router.post('/documents/:id/archive', authMiddleware, adminOnly, (req, res) => documentController.archive(req, res));
router.post('/documents/:id/restore', authMiddleware, adminOnly, (req, res) => documentController.restore(req, res));
router.post('/documents/:id/reprocess', authMiddleware, adminOnly, (req, res) => documentController.reprocess(req, res));

router.post('/chat', authMiddleware, (req, res) => chatController.ask(req, res));
router.post('/feedback', authMiddleware, (req, res) => feedbackController.create(req, res));

router.get('/admin/overview', authMiddleware, adminOnly, (req, res) => adminController.overview(req, res));
router.get('/admin/users', authMiddleware, adminOnly, (req, res) => adminController.users(req, res));
router.post('/admin/users', authMiddleware, adminOnly, (req, res) => adminController.createUser(req, res));
router.patch('/admin/users/:id', authMiddleware, adminOnly, (req, res) => adminController.updateUser(req, res));
router.get('/admin/audit', authMiddleware, adminOnly, (req, res) => adminController.audit(req, res));

export default router;
