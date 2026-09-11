import { Response } from 'express';
import { LRUCache } from 'lru-cache';
import { DocumentService } from '../services/document.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const documentService = new DocumentService();

const accessUrlCache = new LRUCache<string, string>({
  max: 2500,
  // A URL do Supabase dura 10 minutos. Expiramos antes para nunca servir URL vencida.
  ttl: 8 * 60 * 1000,
});

function accessCacheKey(tenantId: string, documentId: string, mode: 'view' | 'download'): string {
  return `${tenantId}:${documentId}:${mode}`;
}

export function invalidateDocumentAccessCache(tenantId?: string, documentId?: string): void {
  if (!tenantId) {
    accessUrlCache.clear();
    return;
  }

  const prefix = documentId ? `${tenantId}:${documentId}:` : `${tenantId}:`;
  for (const key of accessUrlCache.keys()) {
    if (key.startsWith(prefix)) accessUrlCache.delete(key);
  }
}

export class DocumentAccessController {
  async access(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    const mode = req.query.mode === 'download' ? 'download' : 'view';
    const documentId = String(req.params.id);
    const key = accessCacheKey(req.user.tenantId, documentId, mode);
    const cached = accessUrlCache.get(key);

    if (cached) {
      res.set('X-CogniVault-Cache', 'HIT');
      res.set('Cache-Control', 'private, max-age=30');
      res.status(200).json({ url: cached, mode });
      return;
    }

    try {
      const url = await documentService.createAccessUrl(
        req.user.tenantId,
        documentId,
        mode === 'download',
      );

      accessUrlCache.set(key, url);
      res.set('X-CogniVault-Cache', 'MISS');
      res.set('Cache-Control', 'private, max-age=30');
      res.status(200).json({ url, mode });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (message === 'DOCUMENT_NOT_FOUND') {
        res.status(404).json({ error: 'Catálogo não encontrado.' });
        return;
      }

      if (message === 'DOCUMENT_NOT_READY') {
        res.status(409).json({ error: 'O catálogo ainda está sendo processado.' });
        return;
      }

      console.error('❌ Erro ao gerar acesso ao catálogo:', error);
      res.status(500).json({ error: 'Não foi possível acessar o catálogo.' });
    }
  }
}
