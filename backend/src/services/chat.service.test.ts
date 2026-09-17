import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatService } from './chat.service';
import { ChatIntentService } from './chat-intent.service';
import { ReActAgentService } from './react-agent.service';

test('pede o nome da peça quando a pergunta informa somente o modelo', async () => {
  const result = await ChatService.askQuestion('tenant-nao-consultado', 'Qual o código da 143RII?');
  assert.equal(result.status, 'PART_REQUIRED');
  assert.match(result.answer, /falta dizer qual peça/i);
  assert.equal(result.interpreted?.model, '143RII');
});

test('preserva PNC_REQUIRED do gate oficial e não rebaixa para fallback local', async (t) => {
  t.mock.method(ChatIntentService, 'parse', async () => ({
    manufacturer: 'Husqvarna',
    model: '',
    pnc: '',
    partDescription: 'carburador',
    partNumber: '',
    section: '',
    position: '',
  }));
  t.mock.method(ReActAgentService, 'execute', async () => ({
    status: 'PNC_REQUIRED' as const,
    explanation: 'A fonte oficial ficou inconclusiva entre variantes; confirme o PNC.',
    suggestedPnc: '967332904',
    candidates: [],
  }));

  const result = await ChatService.askQuestion(
    'tenant-gate-pnc-regression',
    'carburador para teste do gate oficial sem pnc',
  );

  assert.equal(result.status, 'PNC_REQUIRED');
  assert.equal(result.requiresPnc, true);
  assert.deepEqual(result.pncOptions, ['967332904']);
  assert.match(result.answer, /fonte oficial ficou inconclusiva/i);
  assert.equal(result.part, undefined);
});
