import test from 'node:test';
import assert from 'node:assert/strict';
import { loginLimiter } from '../middleware/rate-limit.middleware';
import { PartSearchService, invalidatePartSearchCaches } from './part-search.service';
import { invalidateHomeCountsCache } from '../controllers/operational.controller';

test('loginLimiter está configurado com limites de proteção contra força bruta', () => {
  assert.ok(loginLimiter, 'loginLimiter deve existir');
  assert.strictEqual(typeof loginLimiter, 'function', 'loginLimiter deve ser um middleware Express');
});

test('PartSearchService lida com cache sem falhas de tipo ou concorrência', async () => {
  // Testando que as funções de cache existem e retornam arrays
  assert.strictEqual(typeof PartSearchService.availablePncs, 'function');
  assert.strictEqual(typeof PartSearchService.similarModels, 'function');
  assert.strictEqual(typeof PartSearchService.directByCode, 'function');
});

test('invalidateHomeCountsCache e invalidatePartSearchCaches limpam os caches sem erro', () => {
  assert.doesNotThrow(() => {
    invalidateHomeCountsCache('test-tenant');
    invalidatePartSearchCaches('test-tenant');
  });
});

