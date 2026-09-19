import test from 'node:test';
import assert from 'node:assert/strict';
import { briggsIplUrl, briggsLanguageLabel, briggsManualSearchEndpoint, isBriggsIplUrl, parseBriggsManuals } from './briggs-manuals';

// Recorte real da resposta de `/_hcms/api/manual-search?partNumber=12J902-0118-01`,
// capturada no navegador em 2026-09-19. Campos irrelevantes foram cortados; os
// que sobraram estão como a Briggs devolve, inclusive o `%7E` no caminho.
const respostaReal = {
  '@odata.count': 13,
  value: [
    {
      tc_PartNumber: '12J902-0118-01',
      tc_DocumentDesc: "EASTERN EUROPEAN INCLUDING ENGLISH (GB) FOR MODEL SERIES 12A800",
      tc_DocType: "Operator's Manual",
      tc_LanguageCode: ['Engine 12 Lang East'],
      tc_RelativePath: 'MS3786EST_LO.pdf',
    },
    {
      tc_PartNumber: '12J902-0118-01',
      tc_DocumentDesc: 'PARTS MANUAL - 12J902-0118-01',
      tc_DocType: 'Illustrated Parts List',
      tc_LanguageCode: ['Chinese'],
      tc_RelativePath: '12J902011801%7EZH_IPLURL_LO.pdf',
    },
    {
      tc_PartNumber: '12J902-0118-01',
      tc_DocumentDesc: 'PARTS MANUAL - 12J902-0118-01',
      tc_DocType: 'Illustrated Parts List',
      tc_LanguageCode: ['English'],
      tc_RelativePath: '12J902011801%7E_IPLURL_LO.pdf',
    },
  ],
};

test('entrega a lista de peças com o inglês PRIMEIRO', () => {
  // Ordem é requisito do dono: *"SEMPRE VOU DAR PRIORIDADE PRO INGLÊS"*. Na
  // resposta real o chinês vem antes, então sem a ordenação o balcão abriria o
  // chinês por reflexo.
  const resultado = parseBriggsManuals('12J902-0118-01', respostaReal);
  assert.equal(resultado.partsManuals.length, 2);
  assert.equal(resultado.partsManuals[0].language, 'English');
  assert.equal(resultado.partsManuals[0].languageLabel, 'inglês');
  assert.equal(resultado.hasEnglish, true);
  assert.equal(
    resultado.partsManuals[0].url,
    'https://www.thepowerportal.com/ipls/ipl.htm?md=12J902011801~_IPLURL_LO.pdf',
  );
});

test('o manual do operador NÃO entra: ele não traz código de peça', () => {
  // O índice devolve os dois tipos misturados, e é essa mistura que fazia o
  // atendente abrir PDF errado na página da Briggs.
  const resultado = parseBriggsManuals('12J902-0118-01', respostaReal);
  assert.equal(resultado.partsManuals.some(item => /MS3786/.test(item.url)), false);
});

test('motor sem IPL em inglês devolve o que existe, e avisa que não tem', () => {
  // Caso real: `103M02-0027-H1` só publica lista em chinês. O dono aceita abrir
  // em outra língua (*"eu tenho que abrir igual para ver o código"*), mas a
  // tela precisa poder dizer isso antes do clique.
  const resultado = parseBriggsManuals('103M02-0027-H1', {
    value: [{
      tc_DocType: 'Illustrated Parts List',
      tc_LanguageCode: ['Chinese'],
      tc_RelativePath: '103M020027H1%7EZH_IPLURL_LO.pdf',
    }],
  });
  assert.equal(resultado.hasEnglish, false);
  assert.equal(resultado.partsManuals.length, 1);
  assert.equal(resultado.partsManuals[0].languageLabel, 'chinês');
});

test('o til chega literal ao visualizador, não percent-encoded', () => {
  // Conferido contra o visualizador: com `%257E` ele responde "file not found".
  // O caminho vem encodado da API, então decodificar é obrigatório.
  assert.equal(
    briggsIplUrl('104M020002F1%7E_IPLURL_LO.pdf'),
    'https://www.thepowerportal.com/ipls/ipl.htm?md=104M020002F1~_IPLURL_LO.pdf',
  );
  assert.equal(
    briggsIplUrl('104M020002F1~_IPLURL_LO.pdf'),
    'https://www.thepowerportal.com/ipls/ipl.htm?md=104M020002F1~_IPLURL_LO.pdf',
  );
});

test('caminho que não é IPL não vira link', () => {
  // O visualizador de IPL só serve IPL. Mandar um manual do operador para ele
  // daria página de erro — e este é o campo onde link quebrado custa
  // atendimento.
  for (const caminho of ['MS3786EST_LO.pdf', '277039WST_F_LO.pdf', '', null, undefined]) {
    assert.equal(briggsIplUrl(caminho), null, String(caminho));
  }
});

test('caminho malformado não vira link em vez de virar link torto', () => {
  for (const caminho of [
    '../../etc/passwd',
    '12J902011801%7E_IPLURL_LO.pdf?x=1',
    'https://atacante.net/a%7E_IPLURL_LO.pdf',
    '12J9 02011801~_IPLURL_LO.pdf',
    '%%_IPLURL_LO.pdf',
  ]) {
    assert.equal(briggsIplUrl(caminho), null, caminho);
  }
});

test('resposta vazia, ausente ou de outra forma não quebra', () => {
  for (const payload of [null, undefined, {}, { value: null }, { value: 'x' }, { value: [] }, { value: [{}] }]) {
    const resultado = parseBriggsManuals('12J902-0118-01', payload);
    assert.deepEqual(resultado.partsManuals, []);
    assert.equal(resultado.hasEnglish, false);
  }
});

test('o mesmo PDF listado duas vezes aparece uma', () => {
  const resultado = parseBriggsManuals('X', {
    value: [
      { tc_DocType: 'Illustrated Parts List', tc_LanguageCode: ['English'], tc_RelativePath: 'A%7E_IPLURL_LO.pdf' },
      { tc_DocType: 'Illustrated Parts List', tc_LanguageCode: ['English'], tc_RelativePath: 'A%7E_IPLURL_LO.pdf' },
    ],
  });
  assert.equal(resultado.partsManuals.length, 1);
});

test('PDF multi-idioma que inclui inglês conta como inglês', () => {
  // `tc_LanguageCode` é array porque um PDF pode cobrir vários idiomas. Se o
  // inglês está lá, serve — e tem que vir primeiro.
  const resultado = parseBriggsManuals('X', {
    value: [
      { tc_DocType: 'Illustrated Parts List', tc_LanguageCode: ['Chinese'], tc_RelativePath: 'B%7EZH_IPLURL_LO.pdf' },
      { tc_DocType: 'Illustrated Parts List', tc_LanguageCode: ['Spanish', 'English'], tc_RelativePath: 'C%7E_IPLURL_LO.pdf' },
    ],
  });
  assert.equal(resultado.hasEnglish, true);
  assert.equal(resultado.partsManuals[0].language, 'English');
});

test('idioma fora da tabela mantém o nome da Briggs em vez de virar vazio', () => {
  // Saber que existe um PDF em turco é melhor que não saber que existe PDF.
  assert.equal(briggsLanguageLabel('Turkish'), 'turco');
  assert.equal(briggsLanguageLabel('Klingon'), 'klingon');
});

test('o endpoint é o mesmo que a página da Briggs usa, e escapa o modelo', () => {
  assert.equal(
    briggsManualSearchEndpoint('12J902-0118-01'),
    'https://www.briggsandstratton.com/_hcms/api/manual-search?partNumber=12J902-0118-01',
  );
  assert.match(briggsManualSearchEndpoint('a b&c'), /partNumber=a%20b%26c$/);
});

test('a guarda do redirect aceita só o visualizador da Briggs', () => {
  // O servidor redireciona para esta URL, então aceitar o que vier é open
  // redirect. A checagem fica no caminho de saída de propósito.
  assert.equal(isBriggsIplUrl('https://www.thepowerportal.com/ipls/ipl.htm?md=A~_IPLURL_LO.pdf'), true);
  for (const url of [
    'https://atacante.net/ipls/ipl.htm?md=A~_IPLURL_LO.pdf',
    'http://www.thepowerportal.com/ipls/ipl.htm?md=A~_IPLURL_LO.pdf',
    'https://www.thepowerportal.com.atacante.net/ipls/ipl.htm?md=A',
    'javascript:alert(1)',
    '',
    null,
    undefined,
  ]) {
    assert.equal(isBriggsIplUrl(url), false, String(url));
  }
});
