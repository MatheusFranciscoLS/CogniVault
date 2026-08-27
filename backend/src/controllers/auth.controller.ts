import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET || (() => {
    throw new Error('JWT_SECRET não definida no .env');
})();


export class AuthController {

    // =========================================================
    // 1. REGISTRO DA EMPRESA + ADMINISTRADOR
    // =========================================================
    async register(req: Request, res: Response): Promise<void> {
        try {
            const { email, password, tenantName } = req.body;

            if (!email?.trim()) {
                res.status(400).json({
                    error: 'O e-mail é obrigatório.'
                });
                return;
            }

            if (!password || password.length < 6) {
                res.status(400).json({
                    error: 'A senha deve possuir pelo menos 6 caracteres.'
                });
                return;
            }

            if (!tenantName?.trim()) {
                res.status(400).json({
                    error: 'O nome da empresa é obrigatório.'
                });
                return;
            }

            const normalizedEmail = email.trim().toLowerCase();
            const normalizedTenantName = tenantName.trim();

            // Verifica se o e-mail já existe
            const existingUser = await prisma.user.findUnique({
                where: {
                    email: normalizedEmail
                }
            });

            if (existingUser) {
                res.status(400).json({
                    error: 'E-mail já cadastrado.'
                });
                return;
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            // Cria empresa + administrador
            const tenant = await prisma.tenant.create({
                data: {
                    name: normalizedTenantName
                }
            });

            const user = await prisma.user.create({
                data: {
                    email: normalizedEmail,
                    password: hashedPassword,
                    tenantId: tenant.id,
                    role: 'ADMIN',
                    status: 'APPROVED'
                }
            });

            res.status(201).json({
                message:
                    'Empresa criada com sucesso! Você já pode fazer login.',
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    tenantId: tenant.id
                }
            });

        } catch (error) {
            console.error('❌ Erro no registro:', error);

            res.status(500).json({
                error: 'Erro interno ao registrar usuário.'
            });
        }
    }

    // =========================================================
    // 2. LOGIN
    // =========================================================
    async login(req: Request, res: Response): Promise<void> {
        try {
            const { email, password } = req.body;

            if (!email?.trim() || !password) {
                res.status(400).json({
                    error: 'E-mail e senha são obrigatórios.'
                });
                return;
            }

            const normalizedEmail = email.trim().toLowerCase();

            // Busca o usuário
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

            // Confere a senha
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

            // Verifica status da conta
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

            // =====================================================
            // JWT
            // O TENANT_ID FICA DENTRO DO TOKEN
            // O FRONTEND NÃO PRECISA ENVIAR TENANT_ID
            // =====================================================

            const token = jwt.sign(
                {
                    id: user.id,
                    role: user.role,
                    tenantId: user.tenantId
                },
                JWT_SECRET,
                {
                    expiresIn: '8h'
                }
            );

            res.status(200).json({
                message: 'Login realizado com sucesso!',
                token,
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
}
