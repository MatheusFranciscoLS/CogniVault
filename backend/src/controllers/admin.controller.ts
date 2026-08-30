import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';

export class AdminController {
    async me(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) {
            res.status(401).json({ error: 'Usuário não autenticado.' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                role: true,
                status: true,
                createdAt: true,
                tenant: { select: { id: true, name: true } },
            },
        });

        if (!user) {
            res.status(404).json({ error: 'Usuário não encontrado.' });
            return;
        }

        res.json({ user });
    }

    async overview(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const tenantId = req.user.tenantId;

        const [tenant, users, activeDocuments, processingDocuments, failedDocuments, parts, feedbackTotal, feedbackCorrect] = await Promise.all([
            prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
            prisma.user.count({ where: { tenantId, status: 'APPROVED' } }),
            prisma.document.count({ where: { tenantId, archivedAt: null, status: 'COMPLETED' } }),
            prisma.document.count({ where: { tenantId, archivedAt: null, status: { in: ['PENDING', 'PROCESSING'] } } }),
            prisma.document.count({ where: { tenantId, archivedAt: null, status: 'FAILED' } }),
            prisma.part.count({ where: { active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } } }),
            prisma.searchFeedback.count({ where: { tenantId } }),
            prisma.searchFeedback.count({ where: { tenantId, correct: true } }),
        ]);

        res.json({
            overview: {
                tenantName: tenant?.name || 'Empresa',
                users,
                activeDocuments,
                processingDocuments,
                failedDocuments,
                parts,
                feedbackTotal,
                feedbackAccuracy: feedbackTotal > 0 ? feedbackCorrect / feedbackTotal : null,
            },
        });
    }

    async users(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;

        const users = await prisma.user.findMany({
            where: { tenantId: req.user.tenantId },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                email: true,
                role: true,
                status: true,
                createdAt: true,
                _count: { select: { searchFeedback: true } },
            },
        });

        res.json({
            users: users.map(({ _count, ...user }) => ({
                ...user,
                feedbackCount: _count.searchFeedback,
            })),
        });
    }

    async createUser(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const { email, password, role } = req.body;

        if (typeof email !== 'string' || !email.trim()) {
            res.status(400).json({ error: 'E-mail é obrigatório.' });
            return;
        }
        if (typeof password !== 'string' || password.length < 6) {
            res.status(400).json({ error: 'A senha inicial precisa ter ao menos 6 caracteres.' });
            return;
        }
        if (role !== undefined && role !== 'ADMIN' && role !== 'MECHANIC') {
            res.status(400).json({ error: 'Perfil inválido.' });
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();
        const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (exists) {
            res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
            return;
        }

        const user = await prisma.user.create({
            data: {
                email: normalizedEmail,
                password: await bcrypt.hash(password, 10),
                role: role === 'ADMIN' ? 'ADMIN' : 'MECHANIC',
                status: 'APPROVED',
                tenantId: req.user.tenantId,
            },
            select: { id: true, email: true, role: true, status: true, createdAt: true },
        });

        await AuditService.record({
            tenantId: req.user.tenantId,
            userId: req.user.id,
            action: 'USER_CREATED',
            targetType: 'USER',
            targetId: user.id,
            metadata: { email: user.email, role: user.role },
        });

        res.status(201).json({ user });
    }

    async updateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const userId = String(req.params.id);
        const { role, status, password } = req.body;

        const target = await prisma.user.findFirst({
            where: { id: userId, tenantId: req.user.tenantId },
        });
        if (!target) {
            res.status(404).json({ error: 'Usuário não encontrado.' });
            return;
        }

        if (target.id === req.user.id && (status === 'REJECTED' || role === 'MECHANIC')) {
            res.status(400).json({ error: 'Você não pode bloquear nem remover seu próprio acesso de administrador.' });
            return;
        }

        if (role !== undefined && role !== 'ADMIN' && role !== 'MECHANIC') {
            res.status(400).json({ error: 'Perfil inválido.' });
            return;
        }
        if (status !== undefined && status !== 'APPROVED' && status !== 'REJECTED' && status !== 'PENDING') {
            res.status(400).json({ error: 'Status inválido.' });
            return;
        }
        if (password !== undefined && (typeof password !== 'string' || password.length < 6)) {
            res.status(400).json({ error: 'A nova senha precisa ter ao menos 6 caracteres.' });
            return;
        }

        const updated = await prisma.user.update({
            where: { id: target.id },
            data: {
                role: role ?? undefined,
                status: status ?? undefined,
                password: password ? await bcrypt.hash(password, 10) : undefined,
            },
            select: { id: true, email: true, role: true, status: true, createdAt: true },
        });

        await AuditService.record({
            tenantId: req.user.tenantId,
            userId: req.user.id,
            action: 'USER_UPDATED',
            targetType: 'USER',
            targetId: target.id,
            metadata: {
                email: target.email,
                role: updated.role,
                status: updated.status,
                passwordChanged: Boolean(password),
            },
        });

        res.json({ user: updated });
    }

    async audit(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;

        const logs = await prisma.auditLog.findMany({
            where: { tenantId: req.user.tenantId },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
                id: true,
                action: true,
                targetType: true,
                targetId: true,
                metadata: true,
                createdAt: true,
                user: { select: { email: true } },
            },
        });

        res.json({ logs });
    }
}
