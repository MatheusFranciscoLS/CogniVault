import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest, invalidateUserAuthCache } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';

const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 64;
const MAX_BCRYPT_PASSWORD_BYTES = 72;
const MAX_ENTITY_ID_LENGTH = 100;
const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPrismaUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && String((error as { code?: unknown }).code) === 'P2002';
}

function validEmail(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0
        && normalized.length <= MAX_EMAIL_LENGTH
        && SIMPLE_EMAIL_PATTERN.test(normalized);
}

export function validAdminPassword(value: unknown): value is string {
    return typeof value === 'string'
        && value.length >= MIN_PASSWORD_LENGTH
        && value.length <= MAX_PASSWORD_LENGTH
        && Buffer.byteLength(value, 'utf8') <= MAX_BCRYPT_PASSWORD_BYTES;
}

const PASSWORD_REQUIREMENTS = `entre ${MIN_PASSWORD_LENGTH} e ${MAX_PASSWORD_LENGTH} caracteres e no máximo ${MAX_BCRYPT_PASSWORD_BYTES} bytes em UTF-8`;

export class AdminController {
    async users(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) return;

            const users = await prisma.user.findMany({
                where: { tenantId: req.user.tenantId },
                orderBy: { createdAt: 'asc' },
                take: 1000,
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
        } catch (error) {
            console.error('❌ Erro ao listar usuários:', error);
            res.status(500).json({ error: 'Não foi possível listar os usuários.' });
        }
    }

    async createUser(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) return;
            const { email, password, role } = req.body;

            if (typeof email !== 'string' || !validEmail(email)) {
                res.status(400).json({ error: 'Informe um e-mail válido de até 254 caracteres.' });
                return;
            }
            if (!validAdminPassword(password)) {
                res.status(400).json({ error: `A senha inicial precisa ter ${PASSWORD_REQUIREMENTS}.` });
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
        } catch (error) {
            if (isPrismaUniqueConstraintError(error)) {
                res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
                return;
            }
            console.error('❌ Erro ao criar usuário:', error);
            res.status(500).json({ error: 'Não foi possível cadastrar o usuário.' });
        }
    }

    async updateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) return;
            const userId = String(req.params.id || '').trim();
            const { role, status, password } = req.body;

            if (!userId || userId.length > MAX_ENTITY_ID_LENGTH) {
                res.status(400).json({ error: 'Usuário inválido.' });
                return;
            }
            if (password !== undefined && !validAdminPassword(password)) {
                res.status(400).json({ error: `A nova senha precisa ter ${PASSWORD_REQUIREMENTS}.` });
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

            const target = await prisma.user.findFirst({
                where: { id: userId, tenantId: req.user.tenantId },
            });
            if (!target) {
                res.status(404).json({ error: 'Usuário não encontrado.' });
                return;
            }

            if (target.id === req.user.id && (status !== undefined && status !== 'APPROVED' || role !== undefined && role !== 'ADMIN')) {
                res.status(400).json({ error: 'Você não pode bloquear, deixar pendente nem remover seu próprio acesso de administrador.' });
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

            invalidateUserAuthCache(target.id);

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
        } catch (error) {
            console.error('❌ Erro ao atualizar usuário:', error);
            res.status(500).json({ error: 'Não foi possível atualizar o usuário.' });
        }
    }

    async audit(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
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
        } catch (error) {
            console.error('❌ Erro ao carregar logs de auditoria:', error);
            res.status(500).json({ error: 'Não foi possível carregar o histórico de auditoria.' });
        }
    }
}
