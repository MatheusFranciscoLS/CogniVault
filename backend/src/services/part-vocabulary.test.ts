import test from 'node:test';
import assert from 'node:assert/strict';
import { focusCandidatesByDescription, scorePartText } from './part-vocabulary';

// Descrições reais colhidas da API: Kawasaki FX921V-ES06 (conjunto
// CARBURETOR(1/2)) e Husqvarna HS 608, seção CARBURADOR.
const CARBURADOR = { name: 'CARBURETOR-ASSY' };
const JUNTA_CARB = { name: 'GASKET,CARBURETOR' };
const JUNTA_PARAFUSO = { name: 'GASKET,SCREW-CARBURETOR' };
const VALVULA_BORB = { name: 'VALVE-THROTTLE' };
const CORPO_CARB = { name: 'CORPO DO CARBURADOR' };

test('quem pede carburador não recebe a junta do carburador', () => {
  // O relato do dono: a junta pontuava como se fosse o carburador. Agora a
  // junta fica abaixo, e a diferença tem que ser larga — não é empate técnico.
  const carburador = scorePartText('carburador', CARBURADOR);
  const junta = scorePartText('carburador', JUNTA_CARB);

  assert.ok(carburador > junta, `carburador (${carburador}) tem que superar a junta (${junta})`);
  assert.ok(junta <= 0.42, `a junta não pode passar do teto de qualificador: ${junta}`);
  assert.ok(carburador > 0.42, `o carburador de verdade não pode ser rebaixado: ${carburador}`);
});

test('o teto vale para toda peça que só menciona o carburador', () => {
  for (const candidato of [JUNTA_CARB, JUNTA_PARAFUSO, CORPO_CARB]) {
    const score = scorePartText('carburador', candidato);
    assert.ok(score <= 0.42, `${candidato.name} deveria ficar no teto, veio ${score}`);
  }
});

test('quem pede a junta recebe a junta, não o carburador', () => {
  // O teto é do QUALIFICADOR, não da peça: pedir "junta do carburador" tem que
  // trazer a junta normalmente. Se isto quebrar, a correção virou censura.
  const junta = scorePartText('junta do carburador', JUNTA_CARB);
  assert.ok(junta > 0.42, `a junta não pode ser rebaixada na própria busca: ${junta}`);
});

test('a lista de "casou direto" deixa de aceitar qualificador', () => {
  // `focusCandidatesByDescription` usa 0.85 como "casou direto". Antes a junta
  // entrava nessa lista; agora só o carburador entra.
  const focados = focusCandidatesByDescription('carburador', [
    { name: JUNTA_CARB.name },
    { name: CARBURADOR.name },
    { name: VALVULA_BORB.name },
  ]);
  assert.ok(focados.length < 3, 'a lista tinha que estreitar');
  assert.ok(focados.some(c => c.name === CARBURADOR.name), 'o carburador tem que estar na lista');
  assert.ok(!focados.some(c => c.name === JUNTA_CARB.name), 'a junta não pode casar direto com "carburador"');
});

test('apelido do catálogo traduzido salva a peça legítima', () => {
  // Catálogo em inglês com apelido em português: o nome diz CARBURETTOR e o
  // apelido diz CARBURADOR. Rebaixar aqui esconderia a peça certa, que é pior
  // que o erro original.
  const comApelido = scorePartText('carburador', {
    name: 'CARBURETTOR',
    aliases: ['CARBURADOR'],
  });
  assert.ok(comApelido > 0.42, `peça legítima com apelido não pode ser rebaixada: ${comApelido}`);
});

test('apelido não promove candidato cujo nome diz outra peça', () => {
  // Apelido é ajuda, não passe livre: se o nome do catálogo diz JUNTA, um
  // apelido solto não transforma a peça em carburador.
  const junta = scorePartText('carburador', {
    name: 'GASKET,CARBURETOR',
    aliases: ['JUNTA DO CARBURADOR'],
  });
  assert.ok(junta <= 0.42, `apelido não deveria promover a junta: ${junta}`);
});

test('peça sem relação com a busca continua fora, sem depender do teto', () => {
  const semRelacao = scorePartText('carburador', { name: 'PNEU' });
  assert.ok(semRelacao < 0.42, `peça de outro assunto: ${semRelacao}`);
});
