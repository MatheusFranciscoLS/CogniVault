import { Router } from 'express';
import multer from 'multer';

import { DocumentController } from '../controllers/document.controller';
import { ChatController } from '../controllers/chat.controller';
import { AuthController } from '../controllers/auth.controller';
import { FeedbackController } from '../controllers/feedback.controller';
import { AdminController } from '../controllers/admin.controller';
import { AdminFeedbackController } from '../controllers/admin-feedback.controller';
import { OperationalController } from '../controllers/operational.controller';
import { OfficialPartVerificationController } from '../controllers/official-part-verification.controller';
import { QualityController } from '../controllers/quality.controller';
import { authMiddleware, adminOnly } from '../middleware/auth.middleware';
import { loginLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

const documentController = new DocumentController();
const chatController = new ChatController();
const authController = new AuthController();
const feedbackController = new FeedbackController();
const adminController = new AdminController();
const adminFeedbackController = new AdminFeedbackController();
const operationalController = new OperationalController();
const officialPartVerificationController = new OfficialPartVerificationController();
const qualityController = new QualityController();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isPdfMime = file.mimetype === 'application/pdf';
    const isPdfExt = file.originalname.toLowerCase().endsWith('.pdf');
    if (isPdfMime || isPdfExt) {
      cb(null, true);
    } else {
      cb(new Error('Somente arquivos PDF são permitidos.'));
    }
  },
});

router.post('/login', loginLimiter, (req, res) => authController.login(req, res));
router.get('/me', authMiddleware, (req, res) => adminController.me(req, res));

router.get('/home', authMiddleware, (req, res) => operationalController.home(req, res));
router.get('/search', authMiddleware, (req, res) => operationalController.search(req, res));
router.get('/parts/:id', authMiddleware, (req, res) => operationalController.part(req, res));
router.get('/history', authMiddleware, (req, res) => operationalController.history(req, res));
router.get('/favorites', authMiddleware, (req, res) => operationalController.favorites(req, res));
router.post('/favorites', authMiddleware, (req, res) => operationalController.addFavorite(req, res));
router.delete('/favorites/:id', authMiddleware, (req, res) => operationalController.removeFavorite(req, res));
router.get('/notifications', authMiddleware, (req, res) => operationalController.notifications(req, res));

router.get('/part-verifications', authMiddleware, (req, res) => officialPartVerificationController.list(req, res));
router.get('/part-verifications/pending', authMiddleware, adminOnly, (req, res) => officialPartVerificationController.pending(req, res));
router.get('/part-verifications/:code/history', authMiddleware, (req, res) => officialPartVerificationController.history(req, res));
router.post('/part-verifications', authMiddleware, (req, res) => officialPartVerificationController.create(req, res));
router.patch('/part-verifications/:id/decision', authMiddleware, adminOnly, (req, res) => officialPartVerificationController.decision(req, res));

router.get('/documents', authMiddleware, (req, res) => documentController.list(req, res));
router.get('/documents/:id/access', authMiddleware, (req, res) => documentController.access(req, res));
router.patch('/documents/:id/category', authMiddleware, adminOnly, (req, res) => documentController.setCategory(req, res));
router.post('/upload', authMiddleware, adminOnly, upload.single('file'), (req, res) => documentController.upload(req, res));
router.post('/documents/:id/archive', authMiddleware, adminOnly, (req, res) => documentController.archive(req, res));
router.post('/documents/:id/restore', authMiddleware, adminOnly, (req, res) => documentController.restore(req, res));
router.post('/documents/:id/reprocess', authMiddleware, adminOnly, (req, res) => documentController.reprocess(req, res));
router.delete('/documents/:id', authMiddleware, adminOnly, (req, res) => documentController.remove(req, res));

router.post('/chat', authMiddleware, (req, res) => chatController.ask(req, res));
router.post('/feedback', authMiddleware, (req, res) => feedbackController.create(req, res));
router.patch('/feedback/:id', authMiddleware, (req, res) => feedbackController.update(req, res));

router.get('/admin/overview', authMiddleware, adminOnly, (req, res) => adminController.overview(req, res));
router.get('/admin/users', authMiddleware, adminOnly, (req, res) => adminController.users(req, res));
router.post('/admin/users', authMiddleware, adminOnly, (req, res) => adminController.createUser(req, res));
router.patch('/admin/users/:id', authMiddleware, adminOnly, (req, res) => adminController.updateUser(req, res));
router.get('/admin/feedback', authMiddleware, adminOnly, (req, res) => adminFeedbackController.list(req, res));
router.delete('/admin/feedback/:id', authMiddleware, adminOnly, (req, res) => adminFeedbackController.delete(req, res));
router.post('/admin/feedback/seed-knowledge', authMiddleware, adminOnly, (req, res) => adminFeedbackController.seedKnowledge(req, res));
router.get('/admin/audit', authMiddleware, adminOnly, (req, res) => adminController.audit(req, res));
router.get('/admin/quality', authMiddleware, adminOnly, (req, res) => qualityController.overview(req, res));
router.post('/admin/quality/benchmark', authMiddleware, adminOnly, (req, res) => qualityController.benchmark(req, res));
router.post('/admin/quality/rebuild-knowledge', authMiddleware, adminOnly, (req, res) => qualityController.rebuildKnowledge(req, res));
router.post('/admin/quality/index-semantics', authMiddleware, adminOnly, (req, res) => qualityController.indexSemantics(req, res));
router.post('/admin/quality/retry-visual-catalogs', authMiddleware, adminOnly, (req, res) => qualityController.retryVisualCatalogs(req, res));
router.patch('/admin/quality/catalogs/:id', authMiddleware, adminOnly, (req, res) => qualityController.reviewDocument(req, res));
router.post('/admin/quality/radar/resolve', authMiddleware, adminOnly, (req, res) => qualityController.resolveRadar(req, res));

export default router;
