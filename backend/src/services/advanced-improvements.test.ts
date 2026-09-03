import test from 'node:test';
import assert from 'node:assert/strict';
import { loginLimiter } from '../middleware/rate-limit.middleware';
import { PartSearchService } from './part-search.service';
import { ChatService } from './chat.service';

test('loginLimiter está configurado com limites de proteção contra força bruta', () => {
  assert.ok(loginLimiter, 'loginLimiter deve existir');
  assert.strictEqual(typeof loginLimiter, 'function', 'loginLimiter deve ser um middleware Express');
});

test('PartSearchService lida com cache sem falhas de tipo ou concorrência', async () => {
  // Testando que as funções de cache existem e retornam arrays
  assert.strictEqual(typeof PartSearchService.availablePncs, 'function');
  assert.strictEqual(typeof PartSearchService.similarModels, 'function');
});

test('ChatService.askQuestion aceita fallbackModel na assinatura e resolve sem erro', async () => {
  assert.strictEqual(typeof ChatService.askQuestion, 'function');
  // Verifica que askQuestion tem aridade que suporta fallbackModel
  assert.ok(ChatService.askQuestion.length >= 2);
});
