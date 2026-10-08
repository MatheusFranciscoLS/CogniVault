import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { LRUCache } from 'lru-cache';
import { prisma } from '../config/prisma';
import { readSessionCookie, setSessionCookie } from '../utils/session-cookie';
import { planSessionRenewal } from '../utils/session-renewal';

function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'test') {
            return 'test-jwt-secret-key-cognivault';
        }
        throw new Error('JWT_SECRET não definida no ambiente');
    }
    return secret;
}

export interface AuthenticatedUser {
    id: string;
    role: 'ADMIN' | 'MECHANIC';
    tenantId: string;
    email?: string;
    name?: string | null;
    status?: string;
    createdAt?: Date;
    tenantName?: string;
}

export interface AuthenticatedRequest extends Request {
    user?: AuthenticatedUser;
}

interface JwtPayload {
    id: string;
    role: 'ADMIN' | 'MECHANIC';
    tenantId: string;
    sessionVersion?: number;
}

interface CachedUser {
    id: string;
    email: string;
    name: string | null;
    tenantId: string;
    role: 'ADMIN' | 'MECHANIC';
    status: string;
    createdAt: Date;
    tenantName: string;
    sessionVersion: number;
}

const DEFAULT_AUTH_CACHE_TTL_MS = 5 * 60 * 1000;
const configuredAuthCacheTtlMs = Number(process.env.AUTH_USER_CACHE_TTL_MS || DEFAULT_AUTH_CACHE_TTL_MS);
const authCacheTtlMs = Number.isFinite(configuredAuthCacheTtlMs)
    ? Math.max(15_000, configuredAuthCacheTtlMs)
    : DEFAULT_AUTH_CACHE_TTL_MS;

const userAuthCache = new LRUCache<string, CachedUser>({
    max: 500,
    // A validação do JWT continua em toda requisição. Somente a releitura de
    // status/role/tenant/sessionVersion no PostgreSQL fica em cache; alterações
    // feitas pelo painel invalidam o usuário imediatamente.
    ttl: authCacheTtlMs,
});

export function normalizeTokenSessionVersion(value: unknown): number | null {
    if (value === undefined) return 0;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
    return value;
}

export function invalidateUserAuthCache(userId?: string): void {
    if (userId) {
        userAuthCache.delete(userId);
    } else {
        userAuthCache.clear();
    }
}

/**
 * Renova o cookie de sessão quando a pessoa está em atividade e a sessão está na
 * segunda metade da vida. Ver `utils/session-renewal.ts` para os números.
 *
 * Roda DEPOIS de todas as validações (assinatura, tenant, `sessionVersion`,
 * status): só sessão válida é renovada, então logout e bloqueio continuam
 * derrubando a sessão na hora. Só renova quando o token veio do COOKIE; quem usa
 * `Authorization: Bearer` é cliente de API e renova fazendo login.
 *
 * **Nunca lança.** Renovar é conforto; um erro aqui não pode transformar uma
 * requisição já autenticada em 401.
 */
function renewSessionIfDue(
    req: Request,
    res: Response,
    claims: Record<string, unknown>,
    user: CachedUser,
): void {
    if (!readSessionCookie(req)) return;
    try {
        const plan = planSessionRenewal(claims, Math.floor(Date.now() / 1000));
        if (!plan) return;
        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                tenantId: user.tenantId,
                sessionVersion: user.sessionVersion,
                authAt: plan.authAt,
            },
            getJwtSecret(),
            { algorithm: 'HS256', expiresIn: plan.expiresInSeconds },
        );
        setSessionCookie(res, token, plan.expiresInSeconds);
    } catch (error) {
        console.error('⚠️ Não foi possível renovar a sessão:', error);
    }
}

export function requestAuthToken(req: Request): string {
    const cookieToken = readSessionCookie(req);
    if (cookieToken) return cookieToken;

    const authHeader = req.headers.authorization;
    if (!authHeader) return '';
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return '';
    return parts[1] || '';
}

export async function authMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const token = requestAuthToken(req);
        if (!token) {
            res.status(401).json({ error: 'Sessão de autenticação não informada.' });
            return;
        }

        const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
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

        const tokenSessionVersion = normalizeTokenSessionVersion(decoded.sessionVersion);
        if (tokenSessionVersion === null) {
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
                    name: true,
                    tenantId: true,
                    role: true,
                    status: true,
                    createdAt: true,
                    sessionVersion: true,
                    tenant: { select: { name: true } },
                },
            });

            if (!dbUser) {
                res.status(401).json({ error: 'Usuário não encontrado ou sessão inválida.' });
                return;
            }

            currentUser = {
                id: dbUser.id,
                email: dbUser.email,
                name: dbUser.name,
                tenantId: dbUser.tenantId,
                role: dbUser.role,
                status: dbUser.status,
                createdAt: dbUser.createdAt,
                tenantName: dbUser.tenant.name,
                sessionVersion: dbUser.sessionVersion,
            };
            userAuthCache.set(payload.id, currentUser);
        }

        if (currentUser.tenantId !== payload.tenantId) {
            res.status(401).json({ error: 'Usuário não encontrado ou sessão inválida.' });
            return;
        }

        if (currentUser.sessionVersion !== tokenSessionVersion) {
            res.status(401).json({ error: 'Sua sessão foi encerrada. Faça login novamente.' });
            return;
        }

        if (currentUser.status !== 'APPROVED') {
            res.status(403).json({ error: 'Sua conta não está ativa.' });
            return;
        }

        req.user = {
            id: currentUser.id,
            email: currentUser.email,
            name: currentUser.name,
            tenantId: currentUser.tenantId,
            role: currentUser.role,
            status: currentUser.status,
            createdAt: currentUser.createdAt,
            tenantName: currentUser.tenantName,
        };

        renewSessionIfDue(req, res, decoded as Record<string, unknown>, currentUser);

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
