import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Em produção, isso fica no arquivo .env
const JWT_SECRET = process.env.JWT_SECRET || 'super_chave_secreta_do_cognivault';

export class AuthController {
    // 1. REGISTRO DA EMPRESA E DO ADMINISTRADOR
    async register(req: Request, res: Response): Promise<void> {
        try {
            const { email, password, tenantName } = req.body;

            // Verifica se o e-mail já existe
            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) {
                res.status(400).json({ error: 'E-mail já cadastrado.' });
                return;
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            // Cria a Empresa e o Usuário Admin ao mesmo tempo!
            const tenant = await prisma.tenant.create({
                data: { name: tenantName }
            });

            const user = await prisma.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    tenantId: tenant.id,
                    role: 'ADMIN',     // Você é o dono
                    status: 'APPROVED' // Já nasce aprovado para poder logar
                }
            });

            res.status(201).json({
                message: 'Empresa criada com sucesso! Você já pode fazer login.',
                user: { id: user.id, email: user.email, role: user.role }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro interno ao registrar usuário.' });
        }
    }

    // 2. LOGIN (A Porta da Frente)
    async login(req: Request, res: Response): Promise<void> {
        try {
            const { email, password } = req.body;

            // Busca o usuário
            const user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                res.status(401).json({ error: 'Credenciais inválidas.' });
                return;
            }

            // Bate a senha digitada com a criptografada no banco
            const isValidPassword = await bcrypt.compare(password, user.password);
            if (!isValidPassword) {
                res.status(401).json({ error: 'Credenciais inválidas.' });
                return;
            }

            // 🚀 A REGRA DE NEGÓCIO: Só entra se estiver aprovado pelo ADM
            if (user.status === 'PENDING') {
                res.status(403).json({ error: 'Sua conta ainda não foi aprovada pelo Administrador.' });
                return;
            }
            if (user.status === 'REJECTED') {
                res.status(403).json({ error: 'Sua conta foi bloqueada.' });
                return;
            }

            // Gera o crachá de acesso (Token) que dura 8 horas
            const token = jwt.sign(
                { id: user.id, role: user.role, tenantId: user.tenantId },
                JWT_SECRET,
                { expiresIn: '8h' }
            );

            // 🚀 AGORA ELE DEVOLVE O TENANT_ID PARA O FRONT-END USAR
            res.status(200).json({
                message: 'Login realizado com sucesso!',
                token,
                user: { id: user.id, email: user.email, tenantId: user.tenantId }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro interno ao fazer login.' });
        }
    }
}