import { Router } from 'express';
import multer from 'multer';
import { CATALOG_UPLOAD_LIMITS } from '../config/upload-limits';

import { DocumentController } from '../controllers/document.controller';
import { DocumentAccessController } from '../controllers/document-access.controller';
import { ChatController } from '../controllers/chat.controller';
import { AuthController } from '../controllers/auth.controller';
import { FeedbackController } from '../controllers/feedback.controller';
import { AdminController } from '../controllers/admin.controller';
import { AdminFeedbackController } from '../controllers/admin-feedback.controller';
import { AdminFeedbackSummaryController } from '../controllers/admin-feedback-summary.controller';
import { OperationalController } from '../controllers/operational.controller';
import { OfficialPartVerificationController } from '../controllers/official-part-verification.controller';
import { QualityController } from '../controllers/quality.controller';
import { WorkIntelligenceController } from '../controllers/work-intelligence.controller';
import { HusqvarnaOfficialController } from '../controllers/husqvarna-official.controller';
import { CommercialSearchController } from '../controllers/commercial-search.controller';
import { CommercialImportController } from '../controllers/commercial-import.controller';
import { WorkContextController } from '../controllers/work-context.controller';
import { PerformanceController } from '../controllers/performance.controller';
import { NotificationController } from '../controllers/notification.controller';
import { ProfileController } from '../controllers/profile.controller';
import { HomeController } from '../controllers/home.controller';
import { FastSearchController } from '../controllers/fast-search.controller';
import { PartDetailController } from '../controllers/part-detail.controller';
import { AdminOverviewController } from '../controllers/admin-overview.controller';
import { CatalogListController } from '../controllers/catalog-list.controller';
import { authMiddleware, adminOnly } from '../middleware/auth.middleware';
import { loginLimiter } from '../middleware/rate-limit.middleware';
import { uploadConcurrencyMiddleware } from '../middleware/upload-concurrency.middleware';
import { searchSingleFlightMiddleware } from '../middleware/search-single-flight.middleware';
import { tenantOperationSingleFlight } from '../middleware/tenant-operation-single-flight.middleware';
import {
  validateEntityIdParam,
  validateFavoriteMutationBody,
  validateHusqvarnaProductSearchQuery,
  validateModelParam,
  validateOfficialFallbackQuery,
  validateOperationalQuoteUsage,
  validateOperationalSearchUsage,
  validatePartCodeParam,
  validatePartLocationBody,
  validateQualityRadarResolution,
  validateSearchQuery,
  validateVisualCatalogRetryRequest,
  validateWorkContextModel,
} from '../middleware/request-validation.middleware';
import {
  invalidateAdminOverviewAfterMutation,
  invalidateDocumentAccessAfterMutation,
  invalidateFavoriteCachesAfterMutation,
  invalidateHomeAfterSearch,
  invalidateNotificationsAfterMutation,
  invalidateWorkContextAfterLocation,
  invalidateWorkContextAfterQuoteUsage,
} from '../middleware/cache-invalidation.middleware';

const router = Router();

const documentController = new DocumentController();
const documentAccessController = new DocumentAccessController();
const chatController = new ChatController();
const authController = new AuthController();
const feedbackController = new FeedbackController();
const adminController = new AdminController();
const adminFeedbackController = new AdminFeedbackController();
const adminFeedbackSummaryController = new AdminFeedbackSummaryController();
const operationalController = new OperationalController();
const officialPartVerificationController = new OfficialPartVerificationController();
const qualityController = new QualityController();
const workIntelligenceController = new WorkIntelligenceController();
const husqvarnaOfficialController = new HusqvarnaOfficialController();
const commercialSearchController = new CommercialSearchController();
const commercialImportController = new CommercialImportController();
const workContextController = new WorkContextController();
const performanceController = new PerformanceController();
const notificationController = new NotificationController();
const profileController = new ProfileController();
const homeController = new HomeController();
const fastSearchController = new FastSearchController();
const partDetailController = new PartDetailController();
const adminOverviewController = new AdminOverviewController();
const catalogListController = new CatalogListController();

const upload = multer({
  dest: 'uploads/',
  limits: CATALOG_UPLOAD_LIMITS,
  fileFilter: (_req, file, cb) => {
    const isPdfMime = file.mimetype === 'application/pdf';
    const isPdfExt = file.originalname.toLowerCase().endsWith('.pdf');
    if (isPdfMime || isPdfExt) cb(null, true);
    else cb(new Error('Somente arquivos PDF são permitidos.'));
  },
});

router.post('/login', loginLimiter, (req, res) => authController.login(req, res));
router.get('/me', authMiddleware, (req, res) => profileController.me(req, res));

router.get('/home', authMiddleware, (req, res) => homeController.home(req, res));
router.get(
  '/search',
  authMiddleware,
  validateSearchQuery,
  invalidateHomeAfterSearch,
  (req, res, next) => fastSearchController.search(req, res, next),
  searchSingleFlightMiddleware,
  (req, res) => operationalController.search(req, res),
);
router.get(
  '/search/stream',
  authMiddleware,
  validateSearchQuery,
  invalidateHomeAfterSearch,
  (req, res, next) => fastSearchController.stream(req, res, next),
  (req, res) => operationalController.searchStream(req, res),
);
router.get('/master-parts/search', authMiddleware, (req, res) => commercialSearchController.search(req, res));
router.get('/official-fallback', authMiddleware, validateOfficialFallbackQuery, (req, res) => workIntelligenceController.officialFallback(req, res));
router.get('/husqvarna/products/search', authMiddleware, validateHusqvarnaProductSearchQuery, (req, res) => husqvarnaOfficialController.productSearch(req, res));
router.get('/husqvarna/products/:pnc/details', authMiddleware, (req, res) => husqvarnaOfficialController.productDetails(req, res));
router.get('/husqvarna/parts/:code/details', authMiddleware, validatePartCodeParam, (req, res) => husqvarnaOfficialController.partDetails(req, res));
router.post('/analytics/search-usage', authMiddleware, validateOperationalSearchUsage, (req, res) => workIntelligenceController.recordSearchUsage(req, res));
router.post('/analytics/quote-usage', authMiddleware, validateOperationalQuoteUsage, invalidateWorkContextAfterQuoteUsage, (req, res) => workIntelligenceController.recordQuoteUsage(req, res));
router.get('/parts/:code/cross-reference', authMiddleware, validatePartCodeParam, (req, res) => operationalController.crossReference(req, res));
router.get('/parts/:code/live-data', authMiddleware, validatePartCodeParam, (req, res) => operationalController.liveData(req, res));
router.get('/parts/:code/work-context', authMiddleware, validatePartCodeParam, validateWorkContextModel, (req, res) => workContextController.get(req, res));
router.put('/parts/:code/location', authMiddleware, validatePartCodeParam, validatePartLocationBody, invalidateWorkContextAfterLocation, (req, res) => workIntelligenceController.setLocation(req, res));
router.get('/models/:model/maintenance-kit', authMiddleware, validateModelParam, (req, res) => operationalController.maintenanceKit(req, res));
router.get('/parts/:id', authMiddleware, validateEntityIdParam, (req, res) => partDetailController.get(req, res));
router.get('/history', authMiddleware, (req, res) => operationalController.history(req, res));
router.get('/favorites', authMiddleware, (req, res) => operationalController.favorites(req, res));
router.post('/favorites', authMiddleware, validateFavoriteMutationBody, invalidateFavoriteCachesAfterMutation, (req, res) => operationalController.addFavorite(req, res));
router.delete('/favorites/:id', authMiddleware, validateEntityIdParam, invalidateFavoriteCachesAfterMutation, (req, res) => operationalController.removeFavorite(req, res));
router.get('/notifications', authMiddleware, (req, res) => notificationController.list(req, res));

router.get('/part-verifications', authMiddleware, (req, res) => officialPartVerificationController.list(req, res));
router.get('/part-verifications/pending', authMiddleware, adminOnly, (req, res) => officialPartVerificationController.pending(req, res));
router.get('/part-verifications/:code/history', authMiddleware, validatePartCodeParam, (req, res) => officialPartVerificationController.history(req, res));
router.post('/part-verifications', authMiddleware, invalidateNotificationsAfterMutation, (req, res) => officialPartVerificationController.create(req, res));
router.patch('/part-verifications/:id/decision', authMiddleware, adminOnly, validateEntityIdParam, invalidateNotificationsAfterMutation, (req, res) => officialPartVerificationController.decision(req, res));

router.get('/documents', authMiddleware, (req, res) => catalogListController.list(req, res));
router.get('/documents/:id/access', authMiddleware, validateEntityIdParam, (req, res) => documentAccessController.access(req, res));
router.patch('/documents/:id/category', authMiddleware, adminOnly, validateEntityIdParam, invalidateDocumentAccessAfterMutation, (req, res) => documentController.setCategory(req, res));
router.post('/upload', authMiddleware, adminOnly, uploadConcurrencyMiddleware, upload.single('file'), invalidateDocumentAccessAfterMutation, (req, res) => documentController.upload(req, res));
router.post('/documents/:id/archive', authMiddleware, adminOnly, validateEntityIdParam, invalidateDocumentAccessAfterMutation, (req, res) => documentController.archive(req, res));
router.post('/documents/:id/restore', authMiddleware, adminOnly, validateEntityIdParam, invalidateDocumentAccessAfterMutation, (req, res) => documentController.restore(req, res));
router.post('/documents/:id/reprocess', authMiddleware, adminOnly, validateEntityIdParam, invalidateDocumentAccessAfterMutation, (req, res) => documentController.reprocess(req, res));
router.post('/documents/:id/refresh-health', authMiddleware, adminOnly, validateEntityIdParam, invalidateDocumentAccessAfterMutation, (req, res) => documentController.refreshHealth(req, res));
router.delete('/documents/:id', authMiddleware, adminOnly, validateEntityIdParam, invalidateDocumentAccessAfterMutation, (req, res) => documentController.remove(req, res));

router.post('/chat', authMiddleware, (req, res) => chatController.ask(req, res));
router.post('/feedback', authMiddleware, invalidateAdminOverviewAfterMutation, (req, res) => feedbackController.create(req, res));
router.patch('/feedback/:id', authMiddleware, validateEntityIdParam, (req, res) => feedbackController.update(req, res));

router.get('/admin/overview', authMiddleware, adminOnly, (req, res) => adminOverviewController.get(req, res));
router.get('/admin/performance', authMiddleware, adminOnly, (req, res) => performanceController.overview(req, res));
router.get('/admin/commercial-imports', authMiddleware, adminOnly, (req, res) => commercialImportController.list(req, res));
router.get('/admin/users', authMiddleware, adminOnly, (req, res) => adminController.users(req, res));
router.post('/admin/users', authMiddleware, adminOnly, invalidateAdminOverviewAfterMutation, (req, res) => adminController.createUser(req, res));
router.patch('/admin/users/:id', authMiddleware, adminOnly, validateEntityIdParam, invalidateAdminOverviewAfterMutation, (req, res) => adminController.updateUser(req, res));
router.get('/admin/feedback', authMiddleware, adminOnly, (req, res) => adminFeedbackSummaryController.list(req, res));
router.delete('/admin/feedback/:id', authMiddleware, adminOnly, validateEntityIdParam, invalidateAdminOverviewAfterMutation, (req, res) => adminFeedbackController.delete(req, res));
router.post('/admin/feedback/seed-knowledge', authMiddleware, adminOnly, tenantOperationSingleFlight('feedback-seed-knowledge'), invalidateAdminOverviewAfterMutation, (req, res) => adminFeedbackController.seedKnowledge(req, res));
router.get('/admin/audit', authMiddleware, adminOnly, (req, res) => adminController.audit(req, res));
router.get('/admin/quality', authMiddleware, adminOnly, (req, res) => qualityController.overview(req, res));
router.get('/admin/quality/search-intelligence', authMiddleware, adminOnly, (req, res) => qualityController.searchIntelligence(req, res));
router.post('/admin/quality/benchmark', authMiddleware, adminOnly, tenantOperationSingleFlight('quality-benchmark'), (req, res) => qualityController.benchmark(req, res));
router.post('/admin/quality/rebuild-knowledge', authMiddleware, adminOnly, tenantOperationSingleFlight('quality-rebuild-knowledge'), (req, res) => qualityController.rebuildKnowledge(req, res));
router.post('/admin/quality/index-semantics', authMiddleware, adminOnly, tenantOperationSingleFlight('semantic-maintenance'), (req, res) => qualityController.indexSemantics(req, res));
router.post('/admin/quality/clear-semantics', authMiddleware, adminOnly, tenantOperationSingleFlight('semantic-maintenance'), (req, res) => qualityController.clearSemantics(req, res));
router.post('/admin/quality/retry-visual-catalogs', authMiddleware, adminOnly, validateVisualCatalogRetryRequest, tenantOperationSingleFlight('visual-catalog-retry'), (req, res) => qualityController.retryVisualCatalogs(req, res));
router.patch('/admin/quality/catalogs/:id', authMiddleware, adminOnly, validateEntityIdParam, invalidateDocumentAccessAfterMutation, (req, res) => qualityController.reviewDocument(req, res));
router.post('/admin/quality/radar/resolve', authMiddleware, adminOnly, validateQualityRadarResolution, (req, res) => qualityController.resolveRadar(req, res));

export default router;