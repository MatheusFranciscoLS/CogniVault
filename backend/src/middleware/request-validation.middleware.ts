import { NextFunction, Request, Response } from 'express';
import {
  MAX_OPERATIONAL_PART_CODE_LENGTH,
  MAX_OPERATIONAL_PART_ID_LENGTH,
  parseOperationalText,
  parseOptionalOperationalText,
} from '../services/operational-input-validation';

const MAX_ENTITY_ID_LENGTH = 100;

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
  // `typed` é o texto que o atendente digitou, sem o contexto que a tela
  // anexa em `q`. Ele decide se a busca consulta MÁQUINA no Portal Husqvarna,
  // ou seja: entra numa chamada externa. Mesmo teto de `q`, e o mesmo 400 para
  // valor estruturado (`?typed=a&typed=b` chega como array).
  const typed = stringQueryParam(req, 'typed');
  if (typed === null || typed.length > 500) {
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

export function validateOfficialPartCodeQuery(req: Request, res: Response, next: NextFunction): void {
  const code = stringQueryParam(req, 'code');
  if (code === null || !code || code.length > 80) {
    res.status(400).json({ error: 'Código oficial inválido ou muito longo.' });
    return;
  }
  next();
}

/**
 * O modelo de motor Briggs decide uma chamada externa, então tem teto e tipo
 * checados antes de chegar ao serviço. 60 caracteres cobrem com folga o maior
 * formato publicado pela Briggs (`XXXXXX-XXXX-XX` com o prefixo
 * "Motor Briggs " que o catálogo guarda).
 */
/**
 * O slug de conjunto Kawasaki vem da nossa própria resposta anterior, mas ele
 * chega pela query do cliente e entra numa chamada externa e numa chave de
 * cache — então a forma é checada aqui, antes de qualquer trabalho. O serviço
 * repete a checagem: esta é a barreira de entrada, aquela é a de uso.
 */
export function validateKawasakiSlugQuery(req: Request, res: Response, next: NextFunction): void {
  const slug = stringQueryParam(req, 'slug');
  if (slug === null || !slug.startsWith('/Kawasaki_Engine/') || slug.length > 400 || slug.includes('..')) {
    res.status(400).json({ error: 'Conjunto Kawasaki inválido.' });
    return;
  }
  next();
}

export function validateBriggsModelQuery(req: Request, res: Response, next: NextFunction): void {
  const model = stringQueryParam(req, 'model');
  if (model === null || !model || model.length > 60) {
    res.status(400).json({ error: 'Modelo de motor inválido ou muito longo.' });
    return;
  }
  next();
}

export function validateHusqvarnaProductSearchQuery(req: Request, res: Response, next: NextFunction): void {
  const query = stringQueryParam(req, 'q');
  if (query === null || query.length > 80) {
    res.status(400).json({ error: 'Consulta de produto Husqvarna inválida ou muito longa.' });
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

export function validateHusqvarnaPncParam(req: Request, res: Response, next: NextFunction): void {
  const rawPnc = req.params.pnc;
  if (typeof rawPnc !== 'string') {
    res.status(400).json({ error: 'PNC inválido.' });
    return;
  }

  if (!/^[\d\s-]+$/.test(rawPnc.trim())) {
    res.status(400).json({ error: 'PNC inválido.' });
    return;
  }

  const normalizedPnc = rawPnc.replace(/\D/g, '');
  if (!/^\d{8,14}$/.test(normalizedPnc)) {
    res.status(400).json({ error: 'PNC inválido.' });
    return;
  }
  next();
}

export function validateEntityIdParam(req: Request, res: Response, next: NextFunction): void {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!id || id.length > MAX_ENTITY_ID_LENGTH) {
    res.status(400).json({ error: 'Identificador inválido.' });
    return;
  }
  next();
}

export function validateFavoriteMutationBody(req: Request, res: Response, next: NextFunction): void {
  const partId = parseOptionalOperationalText(req.body?.partId, MAX_ENTITY_ID_LENGTH);
  const documentId = parseOptionalOperationalText(req.body?.documentId, MAX_ENTITY_ID_LENGTH);
  const hasPartId = Boolean(partId.value);
  const hasDocumentId = Boolean(documentId.value);

  if (!partId.valid || !documentId.valid || hasPartId === hasDocumentId) {
    res.status(400).json({ error: 'Informe exatamente uma peça ou um documento válido para favoritar.' });
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

export function validateQualityRadarResolution(req: Request, res: Response, next: NextFunction): void {
  const all = req.body?.all;
  if (all !== undefined && typeof all !== 'boolean') {
    res.status(400).json({ error: 'Opção de resolução do radar inválida.' });
    return;
  }
  if (all === true) {
    next();
    return;
  }

  const query = parseOperationalText(req.body?.query, 500);
  const pnc = parseOptionalOperationalText(req.body?.pnc, 80);
  if (!query || !pnc.valid) {
    res.status(400).json({ error: 'Consulta ou PNC do radar inválido.' });
    return;
  }
  next();
}

export function validateVisualCatalogRetryRequest(req: Request, res: Response, next: NextFunction): void {
  const requested = req.body?.limit;
  if (requested === undefined) {
    next();
    return;
  }
  if ((typeof requested !== 'number' && typeof requested !== 'string') || String(requested).trim() === '') {
    res.status(400).json({ error: 'Limite da retentativa visual inválido.' });
    return;
  }
  const parsed = Number(requested);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 3) {
    res.status(400).json({ error: 'O limite da retentativa visual deve ser um inteiro entre 1 e 3.' });
    return;
  }
  next();
}
