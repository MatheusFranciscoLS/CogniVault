import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';

export class OperationalController {
    async home(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const { tenantId, id: userId } = req.user;

        const [recentSearches, favorites, recentDocuments, parts, documents] = await Promise.all([
            prisma.searchHistory.findMany({ where: { tenantId, userId }, orderBy: { createdAt: 'desc' }, take: 6 }),
            prisma.favorite.findMany({ where: { tenantId, userId }, orderBy: { createdAt: 'desc' }, take: 6 }),
            prisma.document.findMany({ where: { tenantId, archivedAt: null, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, filename: true, manufacturer: true, model: true, pnc: true, createdAt: true, _count: { select: { parts: true } } } }),
            prisma.part.count({ where: { document: { tenantId, archivedAt: null, status: 'COMPLETED' } } }),
            prisma.document.count({ where: { tenantId, archivedAt: null, status: 'COMPLETED' } }),
        ]);

        res.json({
            home: {
                counts: { parts, documents },
                recentSearches,
                favorites,
                recentDocuments: recentDocuments.map((item) => ({ ...item, partCount: item._count.parts, _count: undefined })),
            },
        });
    }

    async search(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const q = String(req.query.q || '').trim();
        if (q.length < 2) {
            res.json({ parts: [], documents: [] });
            return;
        }

        const normalized = normalizeText(q);
        const identifier = normalizeIdentifier(q);
        const tenantId = req.user.tenantId;
        const compactPattern = identifier && identifier.length >= 4 ? `%${identifier.toLowerCase()}%` : null;

        const compactCodeMatches = compactPattern
            ? await prisma.$queryRaw<Array<{ id: string }>>`
                SELECT p."id"
                FROM "Part" p
                INNER JOIN "Document" d ON d."id" = p."documentId"
                WHERE d."tenantId" = ${tenantId}
                  AND d."archivedAt" IS NULL
                  AND d."status" = 'COMPLETED'
                  AND regexp_replace(lower(p."partNumber"), '[^a-z0-9]', '', 'g') LIKE ${compactPattern}
                LIMIT 40
            `
            : [];
        const compactCodeIds = compactCodeMatches.map((item) => item.id);

        const [parts, documents] = await Promise.all([
            prisma.part.findMany({
                where: {
                    document: { tenantId, archivedAt: null, status: 'COMPLETED' },
                    OR: [
                        { partNumber: { contains: q, mode: 'insensitive' } },
                        { normalizedName: { contains: normalized } },
                        ...(identifier ? [{ normalizedModel: { contains: identifier } }, { normalizedPnc: { contains: identifier } }] : []),
                        ...(compactCodeIds.length ? [{ id: { in: compactCodeIds } }] : []),
                    ],
                },
                orderBy: [{ model: 'asc' }, { name: 'asc' }],
                take: 40,
                select: {
                    id: true, name: true, partNumber: true, manufacturer: true, model: true, pnc: true,
                    universalAcrossPnc: true, section: true, position: true, page: true, documentId: true,
                    document: { select: { filename: true } },
                },
            }),
            prisma.document.findMany({
                where: {
                    tenantId, archivedAt: null, status: 'COMPLETED',
                    OR: [
                        { filename: { contains: q, mode: 'insensitive' } },
                        { manufacturer: { contains: q, mode: 'insensitive' } },
                        { model: { contains: q, mode: 'insensitive' } },
                        { pnc: { contains: q, mode: 'insensitive' } },
                    ],
                },
                orderBy: { createdAt: 'desc' },
                take: 12,
                select: { id: true, filename: true, manufacturer: true, model: true, pnc: true, createdAt: true, _count: { select: { parts: true } } },
            }),
        ]);

        res.json({
            parts: parts.map((part) => ({ ...part, filename: part.document.filename, document: undefined, pnc: part.universalAcrossPnc ? 'Qualquer um' : part.pnc })),
            documents: documents.map((item) => ({ ...item, partCount: item._count.parts, _count: undefined })),
        });
    }

    async part(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const id = String(req.params.id);
        const part = await prisma.part.findFirst({
            where: { id, document: { tenantId: req.user.tenantId, archivedAt: null, status: 'COMPLETED' } },
            include: { document: { select: { id: true, filename: true, manufacturer: true, model: true, pnc: true } } },
        });
        if (!part) {
            res.status(404).json({ error: 'Peça não encontrada.' });
            return;
        }

        const [related, compatibility, favorite] = await Promise.all([
            prisma.part.findMany({
                where: {
                    id: { not: part.id }, normalizedModel: part.normalizedModel,
                    document: { tenantId: req.user.tenantId, archivedAt: null, status: 'COMPLETED' },
                    ...(part.section ? { section: part.section } : {}),
                },
                take: 8,
                select: { id: true, name: true, partNumber: true, model: true, pnc: true, section: true, position: true, page: true },
            }),
            prisma.part.findMany({
                where: {
                    partNumber: part.partNumber,
                    document: { tenantId: req.user.tenantId, archivedAt: null, status: 'COMPLETED' },
                },
                distinct: ['normalizedModel', 'normalizedPnc'],
                take: 30,
                select: { model: true, pnc: true, universalAcrossPnc: true },
            }),
            prisma.favorite.findFirst({ where: { userId: req.user.id, partId: part.id }, select: { id: true } }),
        ]);

        res.json({
            part: {
                ...part,
                pnc: part.universalAcrossPnc ? 'Qualquer um' : part.pnc,
                related,
                compatibility: compatibility.map((item) => ({ model: item.model, pnc: item.universalAcrossPnc ? 'Qualquer um' : item.pnc })),
                favoriteId: favorite?.id || null,
            },
        });
    }

    async history(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const history = await prisma.searchHistory.findMany({
            where: { tenantId: req.user.tenantId, userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        res.json({ history });
    }

    async favorites(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const favorites = await prisma.favorite.findMany({
            where: { tenantId: req.user.tenantId, userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        res.json({ favorites });
    }

    async addFavorite(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const { partId, documentId } = req.body;
        if ((partId && documentId) || (!partId && !documentId)) {
            res.status(400).json({ error: 'Informe uma peça ou um catálogo.' });
            return;
        }

        if (partId) {
            const part = await prisma.part.findFirst({
                where: { id: String(partId), document: { tenantId: req.user.tenantId, archivedAt: null } },
                include: { document: { select: { filename: true } } },
            });
            if (!part) { res.status(404).json({ error: 'Peça não encontrada.' }); return; }
            const favorite = await prisma.favorite.upsert({
                where: { userId_partId: { userId: req.user.id, partId: part.id } },
                update: { label: part.name, reference: part.partNumber, model: part.model, pnc: part.pnc },
                create: { tenantId: req.user.tenantId, userId: req.user.id, kind: 'PART', label: part.name, reference: part.partNumber, model: part.model, pnc: part.pnc, partId: part.id },
            });
            res.status(201).json({ favorite });
            return;
        }

        const document = await prisma.document.findFirst({ where: { id: String(documentId), tenantId: req.user.tenantId, archivedAt: null } });
        if (!document) { res.status(404).json({ error: 'Catálogo não encontrado.' }); return; }
        const favorite = await prisma.favorite.upsert({
            where: { userId_documentId: { userId: req.user.id, documentId: document.id } },
            update: { label: document.filename, model: document.model, pnc: document.pnc },
            create: { tenantId: req.user.tenantId, userId: req.user.id, kind: 'DOCUMENT', label: document.filename, model: document.model, pnc: document.pnc, documentId: document.id },
        });
        res.status(201).json({ favorite });
    }

    async removeFavorite(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const favorite = await prisma.favorite.findFirst({ where: { id: String(req.params.id), tenantId: req.user.tenantId, userId: req.user.id } });
        if (!favorite) { res.status(404).json({ error: 'Favorito não encontrado.' }); return; }
        await prisma.favorite.delete({ where: { id: favorite.id } });
        res.json({ message: 'Favorito removido.' });
    }

    async notifications(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const tenantId = req.user.tenantId;
        const [documents, audits] = await Promise.all([
            prisma.document.findMany({
                where: { tenantId, archivedAt: null, status: { in: ['FAILED', 'PROCESSING', 'PENDING'] } },
                orderBy: { createdAt: 'desc' }, take: 8,
                select: { id: true, filename: true, status: true, createdAt: true },
            }),
            req.user.role === 'ADMIN' ? prisma.auditLog.findMany({
                where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 12,
                select: { id: true, action: true, targetType: true, createdAt: true, user: { select: { email: true } } },
            }) : Promise.resolve([]),
        ]);

        const items = [
            ...documents.map((item) => ({ id: `doc-${item.id}`, type: item.status === 'FAILED' ? 'error' : 'processing', title: item.status === 'FAILED' ? 'Falha no processamento' : 'Catálogo em processamento', description: item.filename, createdAt: item.createdAt })),
            ...audits.map((item) => ({ id: `audit-${item.id}`, type: 'info', title: item.action.replaceAll('_', ' '), description: item.user?.email || 'Sistema', createdAt: item.createdAt })),
        ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 20);

        res.json({ notifications: items });
    }
}
