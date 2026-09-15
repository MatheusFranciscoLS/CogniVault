import assert from 'node:assert/strict';
import test from 'node:test';
import { NextFunction, Request, Response } from 'express';
import {
  validateModelParam,
  validateOfficialFallbackQuery,
  validateOperationalQuoteUsage,
  validateOperationalSearchUsage,
  validatePartCodeParam,
  validatePartLocationBody,
  validateSearchQuery,
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

test('part and model guards reject pathological route input', () => {
  assert.equal(run(validatePartCodeParam, { params: { code: '9'.repeat(81) } as any }).statusCode, 400);
  assert.equal(run(validateWorkContextModel, { query: { model: 'M'.repeat(161) } as any }).statusCode, 400);
  assert.equal(run(validateModelParam, { params: { model: 'M'.repeat(161) } as any }).statusCode, 400);
  assert.equal(run(validatePartCodeParam, { params: { code: '503808302' } as any }).nextCalled, true);
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
