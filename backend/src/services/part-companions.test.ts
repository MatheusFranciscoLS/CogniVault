import test from 'node:test';
import assert from 'node:assert/strict';
import { findCompanions, type CompanionCandidate } from './part-companions';

/** Catálogo da 143R II, no formato em que a base guarda. */
const CATALOGO_143RII: CompanionCandidate[] = [
  { id: '1', partNumber: '505304901', name: 'JUNTA', section: '143RII CARBURADOR', position: '2' },
  { id: '2', partNumber: '506740801', name: 'JUNTA, Carburador', section: '143RII CARBURADOR', position: '3' },
  { id: '3', partNumber: '526522801', name: 'JUNTA, Isolador', section: '143RII CARBURADOR', position: '4' },
  { id: '4', partNumber: '503734102', name: 'FIVELA', section: '143RII CARBURADOR', position: '5' },
  { id: '5', partNumber: '506745101', name: 'JUNTA', section: '143RII MOTOR', position: '6' },
  { id: '6', partNumber: '505296401', name: 'JUNTA', section: '143RII MOTOR', position: '7' },
  { id: '7', partNumber: '503443201', name: 'FILTRO, Combustivel', section: '143RII TANQUE', position: '8' },
  { id: '8', partNumber: '505298201', name: 'PARAFUSO, Junta', section: '143RII CARBURADOR', position: '9' },
];

test('carburador sugere a junta DO CARBURADOR, não uma junta qualquer', () => {
  // O defeito que isto corrige: a versão anterior buscava o termo largo
  // "junta" e devolvia JUNTA / JUNTA / JUNTA / FIVELA / JUNTA / JUNTA. O
  // atendente recebia seis e não sabia qual era a do carburador.
  const r = findCompanions('CARBURADOR', CATALOGO_143RII);

  const codigos = r.items.map(item => item.partNumber);
  assert.ok(codigos.includes('506740801'), 'junta do carburador');
  assert.ok(codigos.includes('526522801'), 'junta do isolador');
  assert.ok(codigos.includes('503443201'), 'filtro de combustivel');

  // As juntas sem qualificador NÃO entram: não dá para afirmar que servem.
  assert.equal(codigos.includes('505304901'), false);
  assert.equal(codigos.includes('506745101'), false);
  assert.equal(codigos.includes('505296401'), false);
  assert.equal(codigos.includes('503734102'), false, 'fivela não é acompanhante');
});

test('"PARAFUSO, Junta" não vira a junta', () => {
  // A descrição contém "Junta", mas o substantivo principal é PARAFUSO. Casar
  // por substring do texto inteiro entregaria o parafuso como se fosse a junta.
  const r = findCompanions('CARBURADOR', CATALOGO_143RII);
  assert.equal(r.items.some(item => item.partNumber === '505298201'), false);
});

test('cada acompanhante aparece uma vez só', () => {
  // Mostrar três candidatos para "Junta do carburador" devolveria o problema
  // original com outra roupa.
  const r = findCompanions('CARBURADOR', CATALOGO_143RII);
  const rotulos = r.items.map(item => item.label);
  assert.equal(new Set(rotulos).size, rotulos.length);
  assert.equal(new Set(r.items.map(i => i.partNumber)).size, r.items.length);
});

test('sem candidato específico, não sugere nada — nem a razão', () => {
  // Máquina cujo catálogo não tem junta de carburador nenhuma. Preferir
  // silêncio a uma junta qualquer é a mesma disciplina do resto do produto.
  const pobre: CompanionCandidate[] = [
    { id: '9', partNumber: '111111111', name: 'PARAFUSO', section: 'X', position: '1' },
    { id: '10', partNumber: '222222222', name: 'JUNTA', section: 'X', position: '2' },
  ];
  const r = findCompanions('CARBURADOR', pobre);
  assert.deepEqual(r.items, []);
  assert.equal(r.reason, '', 'sem peça, a frase também não aparece');
});

test('peça sem regra não inventa acompanhante', () => {
  const r = findCompanions('CHAVE DE VELA', CATALOGO_143RII);
  assert.deepEqual(r.items, []);
  assert.equal(r.reason, '');
});

test('motor aberto pede jogo de juntas, retentor e rolamento', () => {
  // As palavras são do dono: "se ele vai fazer o motor é bom ele trocar o jogo
  // de juntas, retentor do motor e rolamento do motor".
  const motor: CompanionCandidate[] = [
    { id: '1', partNumber: '503443301', name: 'JUNTA, Cilindro', section: 'MOTOR', position: '1' },
    { id: '2', partNumber: '503443401', name: 'RETENTOR, Virabrequim', section: 'MOTOR', position: '2' },
    { id: '3', partNumber: '503443501', name: 'ROLAMENTO, Virabrequim', section: 'MOTOR', position: '3' },
    { id: '4', partNumber: '503443601', name: 'ANEL, Pistao', section: 'MOTOR', position: '4' },
  ];
  const r = findCompanions('PISTAO', motor);
  const rotulos = r.items.map(item => item.label);
  assert.ok(rotulos.includes('Jogo de juntas'));
  assert.ok(rotulos.includes('Retentor'));
  assert.ok(rotulos.includes('Rolamento'));
  assert.ok(r.reason.length > 0);
});

test('o teto de itens é respeitado', () => {
  const r = findCompanions('CARBURADOR', CATALOGO_143RII, 2);
  assert.equal(r.items.length, 2);
});

test('descrição em inglês também casa — o catálogo tem os dois idiomas', () => {
  const ingles: CompanionCandidate[] = [
    { id: '1', partNumber: '577777701', name: 'GASKET, Carburettor', section: 'CARBURETTOR', position: '1' },
    { id: '2', partNumber: '577777702', name: 'GASKET, Insulator', section: 'CARBURETTOR', position: '2' },
  ];
  const r = findCompanions('CARBURETTOR', ingles);
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.items.map(i => i.partNumber).sort(), ['577777701', '577777702']);
});
