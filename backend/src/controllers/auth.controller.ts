import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuditService } from '../services/audit.service';
import { invalidateUserAuthCache } from '../middleware/auth.middleware';
import { clearSessionCookie, setSessionCookie } from '../utils/session-cookie';

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

export class AuthController {
    async login(req: Request, res: Response): Promise<void> {
        try {
            const { email, password } = req.body;

            if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
                res.status(400).json({
                    error: 'E-mail e senha são obrigatórios.'
                });
                return;
            }

            if (email.length > 254 || password.length > 200) {
                res.status(400).json({ error: 'E-mail ou senha excede o tamanho permitido.' });
                return;
            }

            const normalizedEmail = email.trim().toLowerCase();

            const user = await prisma.user.findUnique({
                where: {
                    email: normalizedEmail
                }
            });

            if (!user) {
                res.status(401).json({
                    error: 'Credenciais inválidas.'
                });
                return;
            }

            const isValidPassword = await bcrypt.compare(
                password,
                user.password
            );

            if (!isValidPassword) {
                res.status(401).json({
                    error: 'Credenciais inválidas.'
                });
                return;
            }

            if (user.status === 'PENDING') {
                res.status(403).json({
                    error:
                        'Sua conta ainda não foi aprovada pelo Administrador.'
                });
                return;
            }

            if (user.status === 'REJECTED') {
                res.status(403).json({
                    error: 'Sua conta foi bloqueada.'
                });
                return;
            }

            const token = jwt.sign(
                {
                    id: user.id,
                    role: user.role,
                    tenantId: user.tenantId,
                    sessionVersion: user.sessionVersion,
                },
                getJwtSecret(),
                {
                    algorithm: 'HS256',
                    expiresIn: '8h'
                }
            );

            setSessionCookie(res, token);

            AuditService.record({
                tenantId: user.tenantId,
                userId: user.id,
                action: 'USER_LOGIN',
                targetType: 'USER',
                targetId: user.id,
                metadata: { email: user.email, role: user.role },
            });

            invalidateUserAuthCache(user.id);

            res.status(200).set('Cache-Control', 'no-store').json({
                message: 'Login realizado com sucesso!',
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    tenantId: user.tenantId
                }
            });

        } catch (error) {
            console.error('❌ Erro no login:', error);

            res.status(500).json({
                error: 'Erro interno ao fazer login.'
            });
        }
    }

    logout(_req: Request, res: Response): void {
        clearSessionCookie(res);
        res.status(204).set('Cache-Control', 'no-store').end();
    }
}
