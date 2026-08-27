import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET || (() => {
    throw new Error('JWT_SECRET não definida no .env');
})();

export interface AuthenticatedUser {
    id: string;
    role: 'ADMIN' | 'MECHANIC';
    tenantId: string;
}

export interface AuthenticatedRequest extends Request {
    user?: AuthenticatedUser;
}

interface JwtPayload {
    id: string;
    role: 'ADMIN' | 'MECHANIC';
    tenantId: string;
}

export function authMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void {
    try {
        // =========================================================
        // 1. PEGA O HEADER
        // =========================================================

        const authHeader = req.headers.authorization;

        if (!authHeader) {
            res.status(401).json({
                error: 'Token de autenticação não informado.'
            });
            return;
        }

        // =========================================================
        // 2. SEPARA "Bearer TOKEN"
        // =========================================================

        const parts = authHeader.split(' ');

        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            res.status(401).json({
                error: 'Formato do token inválido. Use: Bearer TOKEN'
            });
            return;
        }

        const token = parts[1];

        // =========================================================
        // 3. VALIDA O TOKEN
        // =========================================================

        const decoded = jwt.verify(
            token,
            JWT_SECRET
        );

        // =========================================================
        // 4. GARANTE QUE O PAYLOAD É UM OBJETO
        // =========================================================

        if (typeof decoded !== 'object' || decoded === null) {
            res.status(401).json({
                error: 'Token inválido.'
            });
            return;
        }

        // =========================================================
        // 5. VALIDA OS CAMPOS DO JWT
        // =========================================================

        if (
            typeof decoded.id !== 'string' ||
            typeof decoded.tenantId !== 'string' ||
            (decoded.role !== 'ADMIN' &&
                decoded.role !== 'MECHANIC')
        ) {
            res.status(401).json({
                error: 'Token possui dados inválidos.'
            });
            return;
        }

        // =========================================================
        // 6. TRANSFORMA O PAYLOAD NO USUÁRIO AUTENTICADO
        // =========================================================

        const user: JwtPayload = {
            id: decoded.id,
            tenantId: decoded.tenantId,
            role: decoded.role
        };

        req.user = user;

        // =========================================================
        // 7. CONTINUA PARA O CONTROLLER
        // =========================================================

        next();

    } catch (error) {
        console.error('❌ Erro de autenticação:', error);

        res.status(401).json({
            error: 'Token inválido ou expirado.'
        });
    }
}
