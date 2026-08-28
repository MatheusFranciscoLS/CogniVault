import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatService } from './chat.service';

test('pede o nome da peça quando a pergunta informa somente o modelo', async () => {
  const result = await ChatService.askQuestion('tenant-nao-consultado', 'Qual o código da 143RII?');
  assert.equal(result.status, 'PART_REQUIRED');
  assert.match(result.answer, /falta dizer qual peça/i);
  assert.equal(result.interpreted?.model, '143RII');
});
