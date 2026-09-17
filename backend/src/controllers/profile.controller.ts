import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class ProfileController {
  async me(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.set('Cache-Control', 'no-store');
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    // A identidade da sessão pode mudar no mesmo navegador após logout/login.
    // Nunca permita que browser, proxy ou CDN reutilize a resposta de outro usuário.
    res.set('Cache-Control', 'no-store');
    res.json({
      user: {
        id: req.user.id,
        tenantId: req.user.tenantId,
        email: req.user.email || '',
        role: req.user.role,
        status: req.user.status || 'APPROVED',
        createdAt: req.user.createdAt || null,
        tenant: {
          id: req.user.tenantId,
          name: req.user.tenantName || 'Empresa',
        },
      },
    });
  }
}
