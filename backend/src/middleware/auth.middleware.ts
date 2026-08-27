import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';

const JWT_SECRET: string = process.env.JWT_SECRET || (() => {
    throw new Error('JWT_SECRET não definida no .env');
})();

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

        const decoded = jwt.verify(parts[1], JWT_SECRET);
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

        const currentUser = await prisma.user.findUnique({
            where: { id: payload.id },
            select: {
                id: true,
                email: true,
                tenantId: true,
                role: true,
                status: true,
            },
        });

        if (!currentUser || currentUser.tenantId !== payload.tenantId) {
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
        console.error('❌ Erro de autenticação:', error);
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
