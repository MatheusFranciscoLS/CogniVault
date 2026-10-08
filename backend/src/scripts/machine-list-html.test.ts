import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCategorySpecs, buildSpecs, htmlToPlainLines, parseMachineListHtml, readPhoto } from './machine-list-html';

// Fixture INVENTADA (códigos e preços de mentira): a lista real tem aviso de propriedade intelectual e
// nunca vai para o repositório. O formato é o que o arquivo real usa.
function page(catalog: Record<string, unknown>): string {
  return `<html><script id="catalogData" type="application/json">${JSON.stringify(catalog)}</script></html>`;
}

const base = {
  tecnologia: 'PRODUTOS A COMBUSTÃO',
  segmento: 'CORTE',
  categoria: 'MOTOSSERRA',
  aplicacao: 'PROFISSIONAL',
  model: 'X100',
  pnc: '900000001',
  descricao: 'MOTOSSERRA MOD X100 14"',
  preco: 'R$ 1.129,00',
  descricao_detalhada: 'MOTOSSERRA X100<br><br>🔹 Sabre 14&quot;<ul><li>Corrente&nbsp;A</li></ul>',
};

test('lê a máquina com preço, aplicação e texto limpo', () => {
  const list = parseMachineListHtml(page({ date: '2026-10-05T20:57:26.086Z', produtos: [base], updates: [] }));
  assert.equal(list.machines.length, 1);
  const [machine] = list.machines;
  assert.equal(machine.pnc, '900000001');
  assert.equal(machine.model, 'X100');
  assert.equal(machine.listPrice, 1129);
  assert.equal(machine.application, 'PROFISSIONAL');
  assert.equal(machine.discontinued, false);
  assert.equal(machine.details, 'MOTOSSERRA X100\n🔹 Sabre 14"\nCorrente A');
  assert.equal(list.listDate.toISOString(), '2026-10-05T20:57:26.086Z');
});

test('aplicação fora de profissional/comercial/ocasional vira nula', () => {
  const rows = [
    { ...base, pnc: '900000002', aplicacao: 'PULVERIZADOR A BATERIA' },
    { ...base, pnc: '900000003', aplicacao: 'Profissional' },
    { ...base, pnc: '900000004', aplicacao: '' },
  ];
  const { machines } = parseMachineListHtml(page({ date: '2026-10-05T00:00:00Z', produtos: rows }));
  assert.deepEqual(machines.map(item => item.application), [null, 'PROFISSIONAL', null]);
});

test('recusa em vez de chutar: sem PNC, sem modelo, preço fora do padrão e PNC repetido', () => {
  const rows = [
    { ...base, pnc: '' },
    { ...base, pnc: '900000010', model: '' },
    { ...base, pnc: '900000011', preco: '1129' },
    { ...base, pnc: '900000012' },
    { ...base, pnc: '900000012', preco: 'R$ 10,00' },
  ];
  const list = parseMachineListHtml(page({ date: '2026-10-05T00:00:00Z', produtos: rows }));
  assert.deepEqual(list.machines.map(item => item.pnc), ['900000012']);
  assert.deepEqual(list.rejected.map(item => item.reason), ['SEM_PNC', 'SEM_MODELO', 'PRECO_INVALIDO', 'PNC_REPETIDO']);
  assert.equal(list.machines[0].listPrice, 1129, 'o primeiro preço fica; o repetido não sobrescreve');
});

test('máquina com preço na lista nunca é descontinuada, mesmo com motivo_sem_preco desatualizado', () => {
  const rows = [{ ...base, motivo_sem_preco: 'descontinuado' }, { ...base, pnc: '900000002' }];
  const { machines } = parseMachineListHtml(page({ date: '2026-10-05T00:00:00Z', produtos: rows }));
  assert.deepEqual(machines.map(item => item.discontinued), [false, false]);
});

test('novidade e mudança de preço vêm do registro de mudanças, e só valem para o preço de hoje', () => {
  const rows = [
    { ...base, pnc: '900000020', preco: 'R$ 949,00' },
    { ...base, pnc: '900000021', preco: 'R$ 500,00' },
    { ...base, pnc: '900000022', preco: 'R$ 700,00' },
  ];
  const updates = [
    { secKey: 'produtos', pnc: '900000020', timestamp: '2026-10-05T10:00:00Z', status: 'Alterado', priceBefore: 'R$ 1.049,00', priceAfter: 'R$ 949,00' },
    { secKey: 'produtos', pnc: '900000021', timestamp: '2026-10-05T10:00:00Z', status: 'Novo', priceBefore: '', priceAfter: 'R$ 500,00' },
    // O último registro descreve outro preço que o de hoje: não pode virar "mudou de X para Y".
    { secKey: 'produtos', pnc: '900000022', timestamp: '2026-10-05T10:00:00Z', status: 'Alterado', priceBefore: 'R$ 600,00', priceAfter: 'R$ 650,00' },
    // Registro de peça não entra.
    { secKey: 'pecas', pnc: '900000020', timestamp: '2026-10-06T10:00:00Z', status: 'Novo', priceBefore: '', priceAfter: 'R$ 1,00' },
  ];
  const { machines } = parseMachineListHtml(page({ date: '2026-10-05T00:00:00Z', produtos: rows, updates }));
  const byPnc = Object.fromEntries(machines.map(item => [item.pnc, item]));
  assert.equal(byPnc['900000020'].priceBefore, 1049);
  assert.equal(byPnc['900000020'].isNew, false);
  assert.equal(byPnc['900000021'].isNew, true);
  assert.equal(byPnc['900000021'].priceBefore, null);
  assert.equal(byPnc['900000022'].priceBefore, null);
});

test('máquina nova que teve ajuste depois continua nova, e o preço anterior vem do último registro', () => {
  const updates = [
    { secKey: 'produtos', pnc: '900000001', timestamp: '2026-10-01T12:00:00Z', status: 'Novo', priceBefore: '', priceAfter: 'R$ 1.200,00' },
    { secKey: 'produtos', pnc: '900000001', timestamp: '2026-10-05T12:00:00Z', status: 'Alterado', priceBefore: 'R$ 1.200,00', priceAfter: 'R$ 1.129,00' },
  ];
  const { machines } = parseMachineListHtml(page({ date: '2026-10-05T00:00:00Z', produtos: [base], updates }));
  assert.equal(machines[0].isNew, true);
  assert.equal(machines[0].priceBefore, 1200);
});

test('usa o registro MAIS RECENTE de cada máquina', () => {
  const updates = [
    { secKey: 'produtos', pnc: '900000001', timestamp: '2026-10-05T12:00:00Z', status: 'Alterado', priceBefore: 'R$ 1.200,00', priceAfter: 'R$ 1.129,00' },
    { secKey: 'produtos', pnc: '900000001', timestamp: '2026-09-01T12:00:00Z', status: 'Alterado', priceBefore: 'R$ 900,00', priceAfter: 'R$ 1.129,00' },
  ];
  const { machines } = parseMachineListHtml(page({ date: '2026-10-05T00:00:00Z', produtos: [base], updates }));
  assert.equal(machines[0].priceBefore, 1200);
});

test('ficha técnica: unidade só em número puro; valor com cara de erro fica de fora', () => {
  const specs = buildSpecs({
    cilindrada: '35 cm³',
    potencia: '1,44 kW (1,93 hp)',
    tanque_l: '0,25',
    peso_produto: '4,4', // peso NÃO entra na ficha (o dono não quer dado de peso em tela nenhuma)
    largura_trabalho_cm: '45',
    rotacao_rpm: '2,9 kW (3,9 hp)', // campo trocado no arquivo: nem é lido
    ipi: '5,2',
    classif_fiscal: '84678100',
    nivel_ruido_dba: '',
  });
  assert.deepEqual(specs, [
    { label: 'Cilindrada', value: '35 cm³' },
    { label: 'Potência', value: '1,44 kW (1,93 hp)' },
    { label: 'Tanque', value: '0,25 L' },
    { label: 'Largura de trabalho', value: '45 cm' },
    { label: 'IPI', value: '5,2 %' },
    { label: 'NCM', value: '84678100' },
  ]);
  assert.deepEqual(buildSpecs({ peso_produto: '4,4' }), []);
});

test('a ordem de exibição é a da Husqvarna: tecnologia, categoria e depois a ordem da máquina', () => {
  const rows = [
    { ...base, pnc: '900000031', model: 'B1', categoria: 'SOPRADOR', tecnologia: 'BATERIA', ordem_exibicao: '1' },
    { ...base, pnc: '900000032', model: 'S2', categoria: 'ROÇADEIRA', tecnologia: 'PRODUTOS A COMBUSTÃO', ordem_exibicao: '2' },
    { ...base, pnc: '900000033', model: 'S1', categoria: 'ROÇADEIRA', tecnologia: 'PRODUTOS A COMBUSTÃO', ordem_exibicao: '1' },
    { ...base, pnc: '900000034', model: 'M1', categoria: 'MOTOSSERRA', tecnologia: 'PRODUTOS A COMBUSTÃO', ordem_exibicao: '9' },
    { ...base, pnc: '900000035', model: 'X1', categoria: 'OUTRA', tecnologia: 'PRODUTOS A COMBUSTÃO' },
  ];
  const catalog = {
    date: '2026-10-05T00:00:00Z',
    produtos: rows,
    technologyOrder: { produtos: ['PRODUTOS A COMBUSTÃO', 'BATERIA'] },
    categoryOrder: { 'produtos\u001fPRODUTOS A COMBUSTÃO': ['MOTOSSERRA', 'ROÇADEIRA'], 'produtos\u001fBATERIA': ['SOPRADOR'] },
  };
  const { machines } = parseMachineListHtml(page(catalog));
  assert.deepEqual(machines.map(item => item.model), ['M1', 'S1', 'S2', 'X1', 'B1']);
  assert.deepEqual(machines.map(item => item.sortOrder), [0, 1, 2, 3, 4]);
});

test('sem a lista de ordem no arquivo, mantém a ordem em que as máquinas vieram', () => {
  const rows = [{ ...base, pnc: '900000041', model: 'A' }, { ...base, pnc: '900000042', model: 'B' }];
  const { machines } = parseMachineListHtml(page({ date: '2026-10-05T00:00:00Z', produtos: rows }));
  assert.deepEqual(machines.map(item => item.model), ['A', 'B']);
});

test('htmlToPlainLines tira marcação e linhas vazias', () => {
  assert.equal(htmlToPlainLines('<div><b>A</b><br><br> B &amp; C</div>'), 'A\nB & C');
  assert.equal(htmlToPlainLines('<br> <br>'), null);
  // Marcação escondida em entidade ou montada pela remoção de outra não sobrevive.
  assert.equal(htmlToPlainLines('a &lt;script&gt;x&lt;/script&gt; b'), 'a x b');
  assert.ok(!/[<>]/.test(htmlToPlainLines('<scr<b>ipt>x</scr</b>ipt>') ?? ''), 'tag montada pela remoção de outra');
  assert.ok(!/[<>]/.test(htmlToPlainLines('5 < 6 > 4 <i') ?? ''));
  // `&amp;lt;` é o texto "&lt;" (uma camada só), não "<".
  assert.equal(htmlToPlainLines('&amp;lt;'), '&lt;');
  assert.equal(htmlToPlainLines(undefined), null);
});

test('arquivo sem a lista de máquinas ou sem data é recusado inteiro', () => {
  assert.throws(() => parseMachineListHtml(page({ date: '2026-10-05T00:00:00Z' })), /produtos/);
  assert.throws(() => parseMachineListHtml(page({ produtos: [] })), /data/);
  assert.throws(() => parseMachineListHtml('<html></html>'), /catalogData/);
});

// "UklGRg==" é só o começo de um webp; o leitor não decodifica a imagem, só confere o tipo e o tamanho.
const WEBP = 'data:image/webp;base64,UklGRg==';

test('a foto da máquina vem do dicionário de imagens pela chave img, só se for imagem comum', () => {
  const list = parseMachineListHtml(page({
    date: '2026-10-05T20:57:26.086Z',
    images: { aaa: WEBP, ruim: 'data:text/html;base64,PGI+', grande: `data:image/png;base64,${'A'.repeat(600_000)}` },
    produtos: [
      { ...base, pnc: '900000001', img: 'aaa' },
      { ...base, pnc: '900000002', img: 'ruim' },
      { ...base, pnc: '900000003', img: 'grande' },
      { ...base, pnc: '900000004', img: 'sumiu' },
      { ...base, pnc: '900000005' },
    ],
    updates: [],
  }));
  const byPnc = new Map(list.machines.map(machine => [machine.pnc, machine.photo]));
  assert.equal(byPnc.get('900000001')?.mime, 'image/webp');
  assert.equal(byPnc.get('900000001')?.data.subarray(0, 4).toString('latin1'), 'RIFF');
  assert.equal(byPnc.get('900000002'), null); // HTML disfarçado de imagem
  assert.equal(byPnc.get('900000003'), null); // grande demais
  assert.equal(byPnc.get('900000004'), null);
  assert.equal(byPnc.get('900000005'), null);
  assert.equal(readPhoto(undefined, 'x'), null);
});

test('transmissão e velocidade só valem para quem se senta para cortar grama; área e inclinação, para o robô', () => {
  const giro = buildCategorySpecs({ transmissao: 'Hydro-Gear ZT-2200 - Hidrostática', velocidade_max_kmh: '10.5 km/h' }, 'GIRO ZERO');
  assert.deepEqual(giro, [{ label: 'Transmissão', value: 'Hydro-Gear ZT-2200 - Hidrostática' }, { label: 'Velocidade máxima', value: '10,5 km/h' }]);

  // velocidade sem unidade, como o arquivo traz em alguns
  assert.deepEqual(buildCategorySpecs({ velocidade_max_kmh: '19,3' }, 'GIRO ZERO'), [{ label: 'Velocidade máxima', value: '19,3 km/h' }]);

  // motosserra: "velocidade" é da corrente (174,9 km/h) e transmissão é o tipo de corrente: nada disso entra
  assert.deepEqual(buildCategorySpecs({ transmissao: 'Corrente H37, passo 3/8"', velocidade_max_kmh: '72 km/h' }, 'MOTOSSERRA'), []);
  // e velocidade absurda, mesmo num giro zero, fica de fora
  assert.deepEqual(buildCategorySpecs({ velocidade_max_kmh: '236 km/h' }, 'GIRO ZERO'), []);
  // transmissão que é só um número não é transmissão
  assert.deepEqual(buildCategorySpecs({ transmissao: '0,51' }, 'TRATOR'), []);

  const robo = buildCategorySpecs({ capacidade_maxima_area: '1.500 m²', inclinacao_max_graus: '22 ° (40%)', transmissao: 'x' }, 'AUTOMOWER LINHA EPOS');
  assert.deepEqual(robo, [{ label: 'Área de trabalho', value: '1.500 m²' }, { label: 'Inclinação máxima', value: '22 ° (40%)' }]);
});
