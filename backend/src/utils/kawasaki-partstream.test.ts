import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kawasakiAssembliesUrl,
  kawasakiPartsUrl,
  kawasakiViewerUrl,
  parseKawasakiAssemblies,
  parseKawasakiAssemblyView,
  parseKawasakiAutocomplete,
  parseKawasakiModelIds,
  parseKawasakiParts,
  resolveKawasakiModel,
} from './kawasaki-partstream';

// Recortes REAIS das respostas do ARI para o FX921V-ES06, capturados em
// 2026-09-19. Encurtados, mas com a marcação exata — inclusive o `%2f%2f` dentro
// do slug e o atributo `name` do `span.ariPLSku`, que são as duas coisas que
// quebram quando se supõe o formato em vez de medir.

const autocomplete = {
  html: '',
  model: [{ Brand: 'KWE', Data: 'FX921V-ES06 4 Stroke Engine FX921V', Description: null }],
};

const search = {
  html: '<ul id="ari_searchResults_GridBody" class="ari-models"> <li class="ari_searchResults_GridRow">'
    + ' <div class="ari_searchResults_Column" slugmid="VluFf8AFynZEPY-DKARqBA2"'
    + ' slugm="FX921V-ES06 4 Stroke Engine FX921V" slugmu="63e707fb-f388-4087-95ee-f0dbb8238447">'
    + ' FX921V-ES06 4 Stroke Engine FX921V </div> </li> </ul>',
};

const SLUG_CARB = '/Kawasaki_Engine/FX921V-ES06_4_Stroke_Engine_FX921V/CARBURETOR(1%2f%2f2)'
  + '/63e707fb-f388-4087-95ee-f0dbb8238447/a0a156a6-736b-4980-9f60-658042fd99b4';

const assemblies = {
  // A lista vem em `model.json`, NÃO no `html` — o `html` traz só o contêiner
  // vazio. Olhar o lugar errado me fez concluir que a árvore não vinha.
  html: '<div id="ariModelAssemblyTree"></div>',
  model: {
    json: [
      {
        data: '*KITS GASKET / CYLINDER HEAD',
        attr: {
          aria: 'OYld0qqsyIIGWi1HAcpYRw2', arib: 'kwe', rel: 'assembly',
          slug: '/Kawasaki_Engine/FX921V-ES06_4_Stroke_Engine_FX921V/*KITS_GASKET_%2f%2f_CYLINDER_HEAD/63e707fb-f388-4087-95ee-f0dbb8238447/97b0edbd-1dcc-4a65-aa4a-3a710a0acd37',
        },
      },
      {
        data: 'CARBURETOR(1/2)',
        attr: { aria: 'xyz2', arib: 'kwe', rel: 'assembly', slug: SLUG_CARB },
      },
      // Nó que não é conjunto: tem que ser descartado.
      { data: 'Agrupamento', attr: { arib: 'kwe', rel: 'folder', slug: '/Kawasaki_Engine/x/y' } },
      // Slug de outro lugar: descartado também.
      { data: 'Intruso', attr: { arib: 'kwe', rel: 'assembly', slug: '/Outra_Marca/x/y' } },
    ],
  },
};

const partsHtml = `
<tr id="ariPLRow_11009_5" class="ariPartInfo ari_row_odd">
  <td class="listTD ariPLTag" align="center">11009</td>
  <td class="listTD ariPLSku" align="center" id="ariparts_sku5" rel="KWE">
    <span class="ariPLSku" name="11009-2056">11009-2056</span>
  </td>
  <td class='listTD ariPLDesc'> GASKET,SCREW-CARBURETOR </td>
  <td class='listTD ariPLPrice' price="Please Contact a Dealer"> Please Contact a Dealer </td>
</tr>
<tr id="ariPLRow_11061A_6" class="ariPartInfo ari_row_even">
  <td class="listTD ariPLTag" align="center">11061A</td>
  <td class="listTD ariPLSku" align="center" id="ariparts_sku6" rel="KWE">
    <span class="ariPLSku" name="11061-7038">11061-7038</span>
  </td>
  <td class='listTD ariPLDesc'> GASKET,CARBURETOR </td>
</tr>
<tr id="ariPLRow_15004_7" class="ariPartInfo ari_row_odd">
  <td class="listTD ariPLTag" align="center">15004</td>
  <td class="listTD ariPLSku" align="center" id="ariparts_sku7" rel="KWE">
    <span class="ariPLSku" name="15004-0937">15004-0937</span>
  </td>
  <td class='listTD ariPLDesc'> CARBURETOR-ASSY </td>
</tr>
<tr class="ariPLHeader"><td>Ref:</td><td>Part</td></tr>
`;

test('lê os nomes completos, que é o que os passos seguintes exigem', () => {
  assert.deepEqual(parseKawasakiAutocomplete(autocomplete), ['FX921V-ES06 4 Stroke Engine FX921V']);
  for (const vazio of [null, undefined, {}, { model: null }, { model: [] }, { model: [{}] }]) {
    assert.deepEqual(parseKawasakiAutocomplete(vazio), []);
  }
});

test('os identificadores saem de slugmid / slugm / slugmu', () => {
  // Os nomes não são óbvios: procurei `modelid=` primeiro e não achei nada.
  assert.deepEqual(parseKawasakiModelIds(search), {
    modelId: 'VluFf8AFynZEPY-DKARqBA2',
    modelGuid: '63e707fb-f388-4087-95ee-f0dbb8238447',
    fullName: 'FX921V-ES06 4 Stroke Engine FX921V',
  });
});

test('HTML sem os três atributos devolve null em vez de objeto pela metade', () => {
  for (const ruim of [
    {},
    { html: '' },
    { html: '<div slugmid="a"></div>' },
    { html: '<div slugmid="a" slugm="b"></div>' },
  ]) {
    assert.equal(parseKawasakiModelIds(ruim), null);
  }
});

test('os conjuntos vêm de model.json, com o slug já montado', () => {
  const lista = parseKawasakiAssemblies(assemblies);
  assert.equal(lista.length, 2);
  assert.equal(lista[1].name, 'CARBURETOR(1/2)');
  assert.equal(lista[1].slug, SLUG_CARB);
  assert.equal(lista[1].viewerUrl, `https://kawasakienginesusa.com/parts-lookup?aribrand=kwe#${SLUG_CARB}`);
});

test('nó que não é conjunto e slug de outra marca são descartados', () => {
  const lista = parseKawasakiAssemblies(assemblies);
  assert.equal(lista.some(item => item.name === 'Agrupamento'), false);
  assert.equal(lista.some(item => item.name === 'Intruso'), false);
});

test('resposta de conjuntos ausente ou torta não quebra', () => {
  for (const ruim of [null, undefined, {}, { model: null }, { model: {} }, { model: { json: 'x' } }, { model: { json: [null] } }]) {
    assert.deepEqual(parseKawasakiAssemblies(ruim), []);
  }
});

test('o código da peça sai do atributo name, não do texto da célula', () => {
  // O texto pode vir com espaço e marcação em volta. O código da peça é o campo
  // onde errar custa devolução, então ele vem do atributo.
  const pecas = parseKawasakiParts(partsHtml);
  assert.equal(pecas.length, 3);
  // `quantity: null` porque o fixture não traz o campo de quantidade — e
  // ausente é null, nunca 1 por suposição.
  assert.deepEqual(pecas[2], { position: '15004', partNumber: '15004-0937', name: 'CARBURETOR-ASSY', quantity: null });
});

test('junta e carburador continuam sendo peças diferentes', () => {
  // A correção do dono, em teste: *"gasket não é o carburador, e sim a junta do
  // carburador. Se for somente o carburador é o 15004, código: 15004-0937."*
  const pecas = parseKawasakiParts(partsHtml);
  const porCodigo = new Map(pecas.map(p => [p.partNumber, p.name]));
  assert.equal(porCodigo.get('15004-0937'), 'CARBURETOR-ASSY');
  assert.equal(porCodigo.get('11061-7038'), 'GASKET,CARBURETOR');
  assert.equal(porCodigo.get('11009-2056'), 'GASKET,SCREW-CARBURETOR');
});

test('linha de cabeçalho não entra como peça', () => {
  const pecas = parseKawasakiParts(partsHtml);
  assert.equal(pecas.some(p => /^Ref/i.test(p.name)), false);
  assert.equal(pecas.every(p => /^[A-Z0-9]{3,6}-[A-Z0-9]{3,6}$/.test(p.partNumber)), true);
});

test('HTML vazio ou sem tabela devolve lista vazia', () => {
  for (const ruim of ['', '<div>nada</div>', '<tr><td>sem classe</td></tr>']) {
    assert.deepEqual(parseKawasakiParts(ruim), []);
  }
});

test('o slug entra com UMA passada de encode, não duas', () => {
  // Medido lado a lado contra o ARI: uma passada responde 200 com as peças,
  // duas respondem "error has occurred".
  //
  // A distinção é fina e foi onde eu errei primeiro. Uma passada faz:
  //   - as barras SEPARADORAS (`/`)        -> `%2F`
  //   - o `%2f` que já vinha dentro do nome -> `%252f`
  // O segundo `%252f` está certo: ele representa o `%2f` literal do slug. O que
  // quebra é `%252F` nos separadores, sinal de que o slug foi encodado 2x.
  const url = kawasakiPartsUrl(SLUG_CARB);
  assert.match(url, /ariq=%2FKawasaki_Engine%2F/);
  assert.equal(url.includes('%252FKawasaki_Engine'), false);
  assert.match(url, /CARBURETOR\(1%252f%252f2\)/);
});

test('a origem vai DUPLO-encodada, como o widget da Kawasaki monta', () => {
  // Com encode simples o ARI recusa. Vale para todas as chamadas.
  for (const url of [
    kawasakiPartsUrl(SLUG_CARB),
    kawasakiAssembliesUrl('ID', 'FX921V-ES06 4 Stroke Engine FX921V', 'GUID'),
  ]) {
    assert.match(url, /ariv=https%253A%252F%252Fkawasakienginesusa\.com/);
  }
});

test('o nome do modelo vai duplo-encodado na consulta de conjuntos', () => {
  const url = kawasakiAssembliesUrl('ID', 'FX921V-ES06 4 Stroke Engine FX921V', 'GUID');
  assert.match(url, /modelName=FX921V-ES06%25204%2520Stroke/);
});

test('a vista explodida é um endereço do site da Kawasaki', () => {
  // É a saída para quando o código não vem: *"pelo menos dê um retorno com a
  // vista explodida para que o atendente verifique manualmente"*.
  const url = kawasakiViewerUrl(SLUG_CARB);
  assert.ok(url.startsWith('https://kawasakienginesusa.com/parts-lookup?aribrand=kwe#/'));
});

test('o autocomplete devolve a LISTA, porque série sem spec traz vários', () => {
  // Medido: `FR691V` devolve 10 modelos. Pegar o primeiro escolheria o spec no
  // lugar do atendente — e spec diferente é catálogo de peças diferente.
  const dez = { model: Array.from({ length: 10 }, (_, i) => ({ Data: `FR691V-AS0${i} 4 Stroke Engine FR691V` })) };
  assert.equal(parseKawasakiAutocomplete(dez).length, 10);
  assert.deepEqual(parseKawasakiAutocomplete({}), []);
  assert.deepEqual(parseKawasakiAutocomplete({ model: [{ Data: 'A' }, { Data: 'A' }] }), ['A']);
});

test('modelo com spec resolve direto', () => {
  const r = resolveKawasakiModel('FX921V-ES06', ['FX921V-ES06 4 Stroke Engine FX921V']);
  assert.deepEqual(r, { kind: 'RESOLVED', fullName: 'FX921V-ES06 4 Stroke Engine FX921V' });
});

test('série sem spec PEDE o spec em vez de escolher um', () => {
  // A regra central deste produto aplicada ao motor de terceiro: não inventar.
  // O spec está na plaqueta, ao lado da série.
  const opcoes = ['FR691V-AR04 4 Stroke Engine FR691V', 'FR691V-AS00 4 Stroke Engine FR691V'];
  const r = resolveKawasakiModel('FR691V', opcoes);
  assert.equal(r.kind, 'NEEDS_SPEC');
  assert.deepEqual(r.kind === 'NEEDS_SPEC' ? r.options : [], opcoes);
});

test('um candidato só resolve, porque não há escolha a fazer', () => {
  const r = resolveKawasakiModel('FS730V', ['FS730V-AS00 4 Stroke Engine FS730V']);
  assert.deepEqual(r, { kind: 'RESOLVED', fullName: 'FS730V-AS00 4 Stroke Engine FS730V' });
});

test('resultado de FAMÍLIA não é modelo e não abre catálogo', () => {
  // `FX1000V` devolve "1000 Series – Carbureted (FX1000V, FX921V)" — um rótulo
  // de família. Tratá-lo como modelo daria peça de outro motor.
  const r = resolveKawasakiModel('FX1000V', ['1000 Series – Carbureted (FX1000V, FX921V)']);
  assert.deepEqual(r, { kind: 'NOT_FOUND' });
  assert.deepEqual(resolveKawasakiModel('X', []), { kind: 'NOT_FOUND' });
});

test('o casamento exato ignora pontuação, como a plaqueta permite', () => {
  for (const digitado of ['FX921V-ES06', 'fx921v es06', 'FX921VES06']) {
    const r = resolveKawasakiModel(digitado, ['FX921V-ES06 4 Stroke Engine FX921V', 'FX921V-AS00 4 Stroke Engine FX921V']);
    assert.equal(r.kind, 'RESOLVED', digitado);
  }
});

// Recorte real do desenho + hotspots do CARBURETOR(1/2) do FX921V-ES06.
// A imagem tem 2192x2867 (conferido no PNG), e o `tag` de cada hotspot é a
// MESMA coluna "Ref" da tabela de peças.
const viewHtml = `
<div id="ariPartImageInfo" origWidth="2192"></div>
<img id="ariparts_image" src="https://cdn.datamanager.arinet.com/image/KWE/311c066f-d93e-4b22-a552-3570f04be48a" class="ariImage" />
<div class="ariHotSpot ariHotSpotHide" tag="11009" coords="1311;2075;1442;2112"></div>
<div class="ariHotSpot ariHotSpotHide" tag="15004" coords="1090;1000;1165;1084"></div>
<div class="ariHotSpot ariHotSpotHide" tag="11009" coords="661;1958;793;1994"></div>
<div class="ariHotSpot ariHotSpotHide" tag="semcoords"></div>
<div class="ariHotSpot ariHotSpotHide" tag="forado" coords="99999;99999;99999;99999"></div>
`;

test('o desenho e as posições saem da MESMA resposta da tabela', () => {
  // Era isto que faltava para a Kawasaki chegar ao nível da Husqvarna: eu
  // estava usando só a tabela e ignorando o desenho e as coordenadas.
  const view = parseKawasakiAssemblyView(viewHtml, 2867);
  assert.equal(view.imageUrl, 'https://cdn.datamanager.arinet.com/image/KWE/311c066f-d93e-4b22-a552-3570f04be48a');
  assert.equal(view.referenceWidth, 2192);
  assert.equal(view.hotspots.length, 3);
});

test('a coordenada vira o CENTRO em porcentagem', () => {
  // `1311;2075;1442;2112` com referência 2192x2867:
  //   x = (1311+1442)/2 / 2192 = 62,8%     y = (2075+2112)/2 / 2867 = 73,0%
  const view = parseKawasakiAssemblyView(viewHtml, 2867);
  const spot = view.hotspots.find(item => item.position === '11009');
  assert.ok(spot);
  assert.ok(Math.abs((spot as { left: number }).left - 62.797) < 0.01);
  assert.ok(Math.abs((spot as { top: number }).top - 73.021) < 0.01);
});

test('sem a altura não há hotspot — marcar seria adivinhar', () => {
  // A altura não vem no HTML; quem chama lê do cabeçalho da imagem. Sem ela, o
  // `y` não tem escala, e hotspot no lugar errado faria o atendente ler o
  // número de outra peça.
  const view = parseKawasakiAssemblyView(viewHtml, null);
  assert.equal(view.imageUrl !== null, true);
  assert.equal(view.referenceWidth, 2192);
  assert.deepEqual(view.hotspots, []);
});

test('hotspot sem coordenada ou fora do desenho é descartado', () => {
  const view = parseKawasakiAssemblyView(viewHtml, 2867);
  assert.equal(view.hotspots.some(item => item.position === 'semcoords'), false);
  assert.equal(view.hotspots.some(item => item.position === 'forado'), false);
});

test('a mesma peça marcada em dois lugares vale nas duas', () => {
  // No carburador do FX921V são 47 marcas para 34 peças: a peça aparece mais de
  // uma vez no desenho, e todas as marcas são onde ela está.
  const view = parseKawasakiAssemblyView(viewHtml, 2867);
  assert.equal(view.hotspots.filter(item => item.position === '11009').length, 2);
});

test('HTML sem desenho não inventa imagem nem posição', () => {
  for (const ruim of ['', '<div>nada</div>', '<img src="https://atacante.net/x.png" />']) {
    const view = parseKawasakiAssemblyView(ruim, 2867);
    assert.equal(view.imageUrl, null, ruim.slice(0, 20));
    assert.deepEqual(view.hotspots, []);
  }
});

test('a quantidade sai do input, e ausente é null e não 1', () => {
  // Medido: 33 das 34 peças do carburador têm quantidade, e `11061-7057` leva
  // **2**. Sem isso o balcão venderia 1 e o cliente voltaria. O carburador vem
  // sem o campo, e afirmar "1" ali seria inventar número.
  const html = `
    <tr class="ariPartInfo">
      <td class="ariPLTag">11061B</td>
      <span class="ariPLSku" name="11061-7057">11061-7057</span>
      <td class='ariPLDesc'> GASKET,INSULATOR </td>
      <td class='ariPLQty'><input type='text' id='ariparts_qty3' value='2' /></td>
    </tr>
    <tr class="ariPartInfo">
      <td class="ariPLTag">15004</td>
      <span class="ariPLSku" name="15004-0937">15004-0937</span>
      <td class='ariPLDesc'> CARBURETOR-ASSY </td>
      <td class='ariPLQty'><span>&nbsp;</span></td>
    </tr>`;
  const pecas = parseKawasakiParts(html);
  assert.equal(pecas.find(p => p.partNumber === '11061-7057')?.quantity, 2);
  assert.equal(pecas.find(p => p.partNumber === '15004-0937')?.quantity, null);
});
