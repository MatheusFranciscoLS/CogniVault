import { NextFunction, Request, Response } from 'express';

function stringQueryParam(req: Request, name: string): string | null {
  const value = req.query[name];
  if (value === undefined) return '';
  return typeof value === 'string' ? value.trim() : null;
}

export function validateSearchQuery(req: Request, res: Response, next: NextFunction): void {
  const query = stringQueryParam(req, 'q');
  if (query === null || query.length > 500) {
    res.status(400).json({ error: 'Consulta inválida ou muito longa.' });
    return;
  }
  next();
}

export function validateOfficialFallbackQuery(req: Request, res: Response, next: NextFunction): void {
  const query = stringQueryParam(req, 'q');
  if (query === null || query.length > 200) {
    res.status(400).json({ error: 'Consulta oficial inválida ou muito longa.' });
    return;
  }
  next();
}

export function validatePartCodeParam(req: Request, res: Response, next: NextFunction): void {
  const code = String(req.params.code || '').trim();
  if (!code || code.length > 80) {
    res.status(400).json({ error: 'Código da peça inválido.' });
    return;
  }
  next();
}

export function validateWorkContextModel(req: Request, res: Response, next: NextFunction): void {
  const model = stringQueryParam(req, 'model');
  if (model === null || model.length > 160) {
    res.status(400).json({ error: 'Modelo inválido ou muito longo.' });
    return;
  }
  next();
}

export function validateModelParam(req: Request, res: Response, next: NextFunction): void {
  const model = String(req.params.model || '').trim();
  if (!model || model.length > 160) {
    res.status(400).json({ error: 'Modelo inválido.' });
    return;
  }
  next();
}
