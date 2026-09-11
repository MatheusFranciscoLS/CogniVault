import { unlink } from 'node:fs/promises';
import { NextFunction, Request, Response } from 'express';

const parsedLimit = Number(process.env.UPLOAD_MAX_CONCURRENT || '1');
export const UPLOAD_MAX_CONCURRENT = Math.max(1, Math.min(3, Number.isFinite(parsedLimit) ? Math.floor(parsedLimit) : 1));

let activeUploads = 0;

async function cleanupRejectedUpload(req: Request): Promise<void> {
  const filePath = (req as Request & { file?: { path?: string } }).file?.path;
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    if (code !== 'ENOENT') console.warn('⚠️ Não foi possível limpar upload concorrente rejeitado:', error);
  }
}

/**
 * O Multer grava primeiro em disco. Esta barreira roda depois dele e evita que
 * vários requests leiam PDFs de até 50 MB para a RAM ao mesmo tempo no Render Free.
 */
export function uploadConcurrencyMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (activeUploads >= UPLOAD_MAX_CONCURRENT) {
    void cleanupRejectedUpload(req);
    res
      .set('Retry-After', '5')
      .status(429)
      .json({ error: 'Já existe um catálogo sendo enviado. Aguarde alguns segundos e tente novamente.' });
    return;
  }

  activeUploads += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeUploads = Math.max(0, activeUploads - 1);
  };

  res.once('finish', release);
  res.once('close', release);
  next();
}

export function uploadConcurrencySnapshot() {
  return { active: activeUploads, limit: UPLOAD_MAX_CONCURRENT };
}
