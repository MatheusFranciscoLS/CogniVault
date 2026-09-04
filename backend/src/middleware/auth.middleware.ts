import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { LRUCache } from 'lru-cache';
import { prisma } from '../config/prisma';

function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'test' || !process.env.NODE_ENV) {
            return 'test-jwt-secret-key-cognivault';
        }
        throw new Error('JWT_SECRET não definida no .env');
    }
    return secret;
}

export interface AuthenticatedUser {
    id: string;
    role: 'ADMIN' | 'MECHANIC';
    tenantId: string;
    email?: string;
}

export interface AuthenticatedRequest extends Request {
    user?: AuthenticatedUser;
}

interface JwtPayload {
    id: string;
    role: 'ADMIN' | 'MECHANIC';
    tenantId: string;
}

interface CachedUser {
    id: string;
    email: string;
    tenantId: string;
    role: 'ADMIN' | 'MECHANIC';
    status: string;
}

const userAuthCache = new LRUCache<string, CachedUser>({
    max: 500,
    ttl: 15 * 1000, // 15 seconds TTL
});

export function invalidateUserAuthCache(userId?: string): void {
    if (userId) {
        userAuthCache.delete(userId);
    } else {
        userAuthCache.clear();
    }
}

export async function authMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.status(401).json({ error: 'Token de autenticação não informado.' });
            return;
        }

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            res.status(401).json({ error: 'Formato do token inválido. Use: Bearer TOKEN' });
            return;
        }

        const decoded = jwt.verify(parts[1], getJwtSecret());
        if (typeof decoded !== 'object' || decoded === null) {
            res.status(401).json({ error: 'Token inválido.' });
            return;
        }

        if (
            typeof decoded.id !== 'string' ||
            typeof decoded.tenantId !== 'string' ||
            (decoded.role !== 'ADMIN' && decoded.role !== 'MECHANIC')
        ) {
            res.status(401).json({ error: 'Token possui dados inválidos.' });
            return;
        }

        const payload = decoded as JwtPayload;

        let currentUser = userAuthCache.get(payload.id);
        if (!currentUser) {
            const dbUser = await prisma.user.findUnique({
                where: { id: payload.id },
                select: {
                    id: true,
                    email: true,
                    tenantId: true,
                    role: true,
                    status: true,
                },
            });

            if (!dbUser) {
                res.status(401).json({ error: 'Usuário não encontrado ou sessão inválida.' });
                return;
            }

            currentUser = dbUser;
            userAuthCache.set(payload.id, dbUser);
        }

        if (currentUser.tenantId !== payload.tenantId) {
            res.status(401).json({ error: 'Usuário não encontrado ou sessão inválida.' });
            return;
        }

        if (currentUser.status !== 'APPROVED') {
            res.status(403).json({ error: 'Sua conta não está ativa.' });
            return;
        }

        req.user = {
            id: currentUser.id,
            email: currentUser.email,
            tenantId: currentUser.tenantId,
            role: currentUser.role,
        };

        next();
    } catch (error) {
        const expectedJwtError = error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError;
        if (!expectedJwtError) console.error('❌ Erro de autenticação:', error);
        res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
}

export function adminOnly(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): void {
    if (!req.user) {
        res.status(401).json({ error: 'Usuário não autenticado.' });
        return;
    }

    if (req.user.role !== 'ADMIN') {
        res.status(403).json({ error: 'Esta ação é permitida somente para administradores.' });
        return;
    }

    next();
}
