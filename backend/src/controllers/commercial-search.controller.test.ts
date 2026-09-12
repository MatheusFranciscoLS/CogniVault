import assert from 'node:assert/strict';
import test from 'node:test';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  CommercialSearchController,
  commercialCodePrefixUpperBound,
  looksLikeCommercialCodePrefix,
} from './commercial-search.controller';

test('detecta Part Number numérico parcial sem confundir modelos curtos', () => {
  assert.equal(looksLikeCommercialCodePrefix('58710'), true);
  assert.equal(looksLikeCommercialCodePrefix('587 10 67'), true);
  assert.equal(looksLikeCommercialCodePrefix('MZ54'), false);
  assert.equal(looksLikeCommercialCodePrefix('K770'), false);
  assert.equal(looksLikeCommercialCodePrefix('filtro'), false);
});

test('aceita códigos alfanuméricos longos quando a maior parte é numérica', () => {
  assert.equal(looksLikeCommercialCodePrefix('12345A7'), true);
  assert.equal(looksLikeCommercialCodePrefix('ABC12345'), false);
});

test('gera limite superior exclusivo para busca por range no índice btree', () => {
  assert.equal(commercialCodePrefixUpperBound('58710'), '58711');
  assert.equal(commercialCodePrefixUpperBound('ABC99'), 'ABC9:');
});

test('rejeita consulta comercial grande antes de consultar o banco', async () => {
  let statusCode = 200;
  let payload: any;
  const req = {
    query: { q: 'x'.repeat(201) },
    user: { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-1' },
  } as unknown as AuthenticatedRequest;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
  } as unknown as Response;

  await new CommercialSearchController().search(req, res);

  assert.equal(statusCode, 400);
  assert.match(payload?.error || '', /muito longa/i);
});
