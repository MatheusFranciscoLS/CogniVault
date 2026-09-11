import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class ProfileController {
  async me(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    res.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=240');
    res.json({
      user: {
        id: req.user.id,
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
