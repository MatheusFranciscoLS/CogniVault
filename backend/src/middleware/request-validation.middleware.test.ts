import assert from 'node:assert/strict';
import test from 'node:test';
import { NextFunction, Request, Response } from 'express';
import {
  validateEntityIdParam,
  validateFavoriteMutationBody,
  validateHusqvarnaPncParam,
  validateHusqvarnaProductSearchQuery,
  validateOfficialPartCodeQuery,
  validateModelParam,
  validateOfficialFallbackQuery,
  validateOperationalQuoteUsage,
  validateOperationalSearchUsage,
  validatePartCodeParam,
  validatePartLocationBody,
  validateQualityRadarResolution,
  validateSearchQuery,
  validateVisualCatalogRetryRequest,
  validateWorkContextModel,
} from './request-validation.middleware';

function run(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  req: Partial<Request>,
) {
  let statusCode = 200;
  let payload: any;
  let nextCalled = false;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
  } as unknown as Response;
  middleware(req as Request, res, () => { nextCalled = true; });
  return { statusCode, payload, nextCalled };
}

test('search query middleware rejects oversized and structured query values', () => {
  assert.equal(run(validateSearchQuery, { query: { q: 'x'.repeat(501) } as any }).statusCode, 400);
  assert.equal(run(validateSearchQuery, { query: { q: ['abc'] } as any }).statusCode, 400);
  assert.equal(run(validateSearchQuery, { query: { q: 'filtro de ar' } as any }).nextCalled, true);
});

test('official fallback query is capped before external services are called', () => {
  assert.equal(run(validateOfficialFallbackQuery, { query: { q: '9'.repeat(201) } as any }).statusCode, 400);
  assert.equal(run(validateOfficialFallbackQuery, { query: { q: '503808302' } as any }).nextCalled, true);
});

test('official part index rejects missing, structured and oversized codes', () => {
  assert.equal(run(validateOfficialPartCodeQuery, { query: {} } as any).statusCode, 400);
  assert.equal(run(validateOfficialPartCodeQuery, { query: { code: ['503808302'] } } as any).statusCode, 400);
  assert.equal(run(validateOfficialPartCodeQuery, { query: { code: '9'.repeat(81) } } as any).statusCode, 400);
  assert.equal(run(validateOfficialPartCodeQuery, { query: { code: '503 808 302' } } as any).nextCalled, true);
});

test('official product search rejects structured or oversized queries before upstream work', () => {
  assert.equal(run(validateHusqvarnaProductSearchQuery, { query: { q: ['TS114'] } as any }).statusCode, 400);
  assert.equal(run(validateHusqvarnaProductSearchQuery, { query: { q: { model: 'TS114' } } as any }).statusCode, 400);
  assert.equal(run(validateHusqvarnaProductSearchQuery, { query: { q: 'x'.repeat(81) } as any }).statusCode, 400);
  assert.equal(run(validateHusqvarnaProductSearchQuery, { query: { q: 'TS 114' } as any }).nextCalled, true);
});

test('part, model and generic entity guards reject pathological route input', () => {
  assert.equal(run(validatePartCodeParam, { params: { code: '9'.repeat(81) } as any }).statusCode, 400);
  assert.equal(run(validateWorkContextModel, { query: { model: 'M'.repeat(161) } as any }).statusCode, 400);
  assert.equal(run(validateModelParam, { params: { model: 'M'.repeat(161) } as any }).statusCode, 400);
  assert.equal(run(validateEntityIdParam, { params: { id: 'x'.repeat(101) } as any }).statusCode, 400);
  assert.equal(run(validateEntityIdParam, { params: { id: '   ' } as any }).statusCode, 400);
  assert.equal(run(validatePartCodeParam, { params: { code: '503808302' } as any }).nextCalled, true);
  assert.equal(run(validateEntityIdParam, { params: { id: '550e8400-e29b-41d4-a716-446655440000' } as any }).nextCalled, true);
});

test('Husqvarna PNC route guard accepts formatted values and rejects structured or invalid values', () => {
  assert.equal(run(validateHusqvarnaPncParam, { params: { pnc: '967 33 29-01' } } as any).nextCalled, true);
  assert.equal(run(validateHusqvarnaPncParam, { params: { pnc: ['967332901'] } } as any).statusCode, 400);
  assert.equal(run(validateHusqvarnaPncParam, { params: { pnc: '1234567' } } as any).statusCode, 400);
  assert.equal(run(validateHusqvarnaPncParam, { params: { pnc: 'x'.repeat(20) } } as any).statusCode, 400);
  assert.equal(run(validateHusqvarnaPncParam, { params: { pnc: 'abc967332901' } } as any).statusCode, 400);
});

test('favorite mutation requires exactly one bounded string identifier', () => {
  assert.equal(run(validateFavoriteMutationBody, { body: { partId: 'part-1' } } as any).nextCalled, true);
  assert.equal(run(validateFavoriteMutationBody, { body: { documentId: 'doc-1' } } as any).nextCalled, true);
  assert.equal(run(validateFavoriteMutationBody, { body: {} } as any).statusCode, 400);
  assert.equal(run(validateFavoriteMutationBody, { body: { partId: 'part-1', documentId: 'doc-1' } } as any).statusCode, 400);
  assert.equal(run(validateFavoriteMutationBody, { body: { partId: { id: 'part-1' } } } as any).statusCode, 400);
  assert.equal(run(validateFavoriteMutationBody, { body: { documentId: 'x'.repeat(101) } } as any).statusCode, 400);
});

test('operational search analytics rejects structured or oversized text before database work', () => {
  const validBody = { query: 'filtro de ar', partNumber: '503808303', partId: 'part-1', model: '143RII' };
  assert.equal(run(validateOperationalSearchUsage, { body: validBody } as any).nextCalled, true);
  assert.equal(run(validateOperationalSearchUsage, { body: { ...validBody, query: { text: 'filtro' } } } as any).statusCode, 400);
  assert.equal(run(validateOperationalSearchUsage, { body: { ...validBody, partNumber: '9'.repeat(81) } } as any).statusCode, 400);
  assert.equal(run(validateOperationalSearchUsage, { body: { ...validBody, sourceFilename: ['catalog.pdf'] } } as any).statusCode, 400);
});

test('quote analytics rejects malformed sessions and partial oversized batches', () => {
  assert.equal(run(validateOperationalQuoteUsage, { body: { sessionId: 'quote-1', items: [{ partNumber: '503808303' }] } } as any).nextCalled, true);
  assert.equal(run(validateOperationalQuoteUsage, { body: { sessionId: { id: 'quote-1' }, items: [{ partNumber: '503808303' }] } } as any).statusCode, 400);
  assert.equal(run(validateOperationalQuoteUsage, { body: { sessionId: 'quote-1', items: Array.from({ length: 61 }, () => ({ partNumber: '503808303' })) } } as any).statusCode, 400);
});

test('part location validation accepts text only and keeps note bounded', () => {
  assert.equal(run(validatePartLocationBody, { body: { location: 'Corredor A', note: 'Prateleira 2' } } as any).nextCalled, true);
  assert.equal(run(validatePartLocationBody, { body: { location: ['Corredor A'], note: '' } } as any).statusCode, 400);
  assert.equal(run(validatePartLocationBody, { body: { location: 'Corredor A', note: 'x'.repeat(501) } } as any).statusCode, 400);
});

test('quality radar resolution rejects structured and oversized payloads before database work', () => {
  assert.equal(run(validateQualityRadarResolution, { body: { all: true } } as any).nextCalled, true);
  assert.equal(run(validateQualityRadarResolution, { body: { all: 'true' } } as any).statusCode, 400);
  assert.equal(run(validateQualityRadarResolution, { body: { query: 'filtro 143RII', pnc: '967983916' } } as any).nextCalled, true);
  assert.equal(run(validateQualityRadarResolution, { body: { query: { text: 'filtro' } } } as any).statusCode, 400);
  assert.equal(run(validateQualityRadarResolution, { body: { query: 'x'.repeat(501) } } as any).statusCode, 400);
  assert.equal(run(validateQualityRadarResolution, { body: { query: 'filtro', pnc: ['967983916'] } } as any).statusCode, 400);
  assert.equal(run(validateQualityRadarResolution, { body: { query: 'filtro', pnc: '9'.repeat(81) } } as any).statusCode, 400);
});

test('visual catalog retry accepts only integer limits between one and three', () => {
  assert.equal(run(validateVisualCatalogRetryRequest, { body: {} } as any).nextCalled, true);
  assert.equal(run(validateVisualCatalogRetryRequest, { body: { limit: 1 } } as any).nextCalled, true);
  assert.equal(run(validateVisualCatalogRetryRequest, { body: { limit: '3' } } as any).nextCalled, true);
  assert.equal(run(validateVisualCatalogRetryRequest, { body: { limit: Number.NaN } } as any).statusCode, 400);
  assert.equal(run(validateVisualCatalogRetryRequest, { body: { limit: 1.5 } } as any).statusCode, 400);
  assert.equal(run(validateVisualCatalogRetryRequest, { body: { limit: 4 } } as any).statusCode, 400);
  assert.equal(run(validateVisualCatalogRetryRequest, { body: { limit: { value: 1 } } } as any).statusCode, 400);
});

test('typed é validado como q, porque decide uma chamada externa de máquina', () => {
  // `typed` é o texto digitado pelo atendente, e é ele que decide se a busca
  // consulta o Portal Husqvarna. Sem teto, um valor gigante entraria na
  // tokenização; sem a checagem de tipo, `?typed=a&typed=b` chegaria como
  // array e quebraria o parse.
  assert.equal(run(validateSearchQuery, { query: { q: 'carburador', typed: 'x'.repeat(501) } as any }).statusCode, 400);
  assert.equal(run(validateSearchQuery, { query: { q: 'carburador', typed: ['a', 'b'] } as any }).statusCode, 400);
  assert.equal(run(validateSearchQuery, { query: { q: 'carburador 143RII', typed: 'carburador 143RII' } as any }).nextCalled, true);
  // Ausente continua valendo: a rota cai no `q` quando a tela não manda.
  assert.equal(run(validateSearchQuery, { query: { q: 'carburador' } as any }).nextCalled, true);
});
