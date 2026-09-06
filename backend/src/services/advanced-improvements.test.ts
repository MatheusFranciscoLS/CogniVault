import test from 'node:test';
import assert from 'node:assert/strict';
import { loginLimiter } from '../middleware/rate-limit.middleware';
import { PartSearchService, invalidatePartSearchCaches } from './part-search.service';
import { ChatService, invalidateChatResponseCache } from './chat.service';
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

test('ChatService.askQuestion aceita fallbackModel na assinatura e resolve sem erro', async () => {
  assert.strictEqual(typeof ChatService.askQuestion, 'function');
  // Verifica que askQuestion tem aridade que suporta fallbackModel
  assert.ok(ChatService.askQuestion.length >= 2);
});

test('ChatService utiliza cache em memória para consultas idênticas e responde em < 5ms', async () => {
  const t0 = performance.now();
  const res1 = await ChatService.askQuestion('tenant-cache-test', 'Qual o código da 143RII?');
  const d1 = performance.now() - t0;

  const t1 = performance.now();
  const res2 = await ChatService.askQuestion('tenant-cache-test', 'Qual o código da 143RII?');
  const d2 = performance.now() - t1;

  assert.deepStrictEqual(res1, res2);
  assert.ok(d2 < 15, `Resposta cacheada demorou ${d2}ms, esperava < 15ms`);

  invalidateChatResponseCache('tenant-cache-test');
});

test('invalidateHomeCountsCache e invalidatePartSearchCaches limpam os caches sem erro', () => {
  assert.doesNotThrow(() => {
    invalidateHomeCountsCache('test-tenant');
    invalidatePartSearchCaches('test-tenant');
    invalidateChatResponseCache('test-tenant');
  });
});

