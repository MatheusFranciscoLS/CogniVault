import { NextFunction, Request, Response } from 'express';
import {
  MAX_OPERATIONAL_PART_CODE_LENGTH,
  MAX_OPERATIONAL_PART_ID_LENGTH,
  parseOperationalText,
  parseOptionalOperationalText,
} from '../services/operational-input-validation';

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

export function validateOperationalSearchUsage(req: Request, res: Response, next: NextFunction): void {
  const query = parseOperationalText(req.body?.query, 500);
  const partNumber = parseOperationalText(req.body?.partNumber, MAX_OPERATIONAL_PART_CODE_LENGTH);
  const partId = parseOptionalOperationalText(req.body?.partId, MAX_OPERATIONAL_PART_ID_LENGTH);
  const name = parseOptionalOperationalText(req.body?.name, 500);
  const model = parseOptionalOperationalText(req.body?.model, 200);
  const pnc = parseOptionalOperationalText(req.body?.pnc, 200);
  const sourceFilename = parseOptionalOperationalText(req.body?.sourceFilename, 500);

  if (!query || !partNumber || !partId.valid || !name.valid || !model.valid || !pnc.valid || !sourceFilename.valid) {
    res.status(400).json({ error: 'Dados da consulta operacional inválidos.' });
    return;
  }
  next();
}

export function validateOperationalQuoteUsage(req: Request, res: Response, next: NextFunction): void {
  const sessionId = parseOperationalText(req.body?.sessionId, 120);
  const items = req.body?.items;

  if (!sessionId || !Array.isArray(items) || items.length < 1 || items.length > 60) {
    res.status(400).json({ error: 'Sessão ou itens do orçamento inválidos.' });
    return;
  }
  next();
}

export function validatePartLocationBody(req: Request, res: Response, next: NextFunction): void {
  const location = parseOperationalText(req.body?.location, 160);
  const note = parseOptionalOperationalText(req.body?.note, 500);

  if (!location || !note.valid) {
    res.status(400).json({ error: 'Localização ou observação inválida.' });
    return;
  }
  next();
}
