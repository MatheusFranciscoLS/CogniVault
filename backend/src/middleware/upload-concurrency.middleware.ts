import { NextFunction, Request, Response } from 'express';

const parsedLimit = Number(process.env.UPLOAD_MAX_CONCURRENT || '1');
export const UPLOAD_MAX_CONCURRENT = Math.max(1, Math.min(3, Number.isFinite(parsedLimit) ? Math.floor(parsedLimit) : 1));

let activeUploads = 0;

/**
 * Reserva capacidade antes do Multer receber o corpo do PDF. Assim, requests
 * concorrentes excedentes são rejeitados antes de gravarem arquivos grandes no
 * disco temporário ou iniciarem o processamento em memória.
 */
export function uploadConcurrencyMiddleware(_req: Request, res: Response, next: NextFunction): void {
  if (activeUploads >= UPLOAD_MAX_CONCURRENT) {
    res
      .set('Retry-After', '5')
      .status(429)
      .json({ error: 'Já existe um catálogo sendo enviado. Aguarde alguns segundos e tente novamente.' });
    return;
  }

  activeUploads += 1;
  let released = false;

  const release = (): void => {
    if (released) return;
    released = true;
    activeUploads = Math.max(0, activeUploads - 1);
    res.off('finish', release);
    res.off('close', release);
    res.off('error', release);
  };

  res.once('finish', release);
  res.once('close', release);
  res.once('error', release);

  try {
    next();
  } catch (error) {
    release();
    throw error;
  }
}

export function uploadConcurrencySnapshot() {
  return { active: activeUploads, limit: UPLOAD_MAX_CONCURRENT };
}
