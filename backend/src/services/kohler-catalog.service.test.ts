import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { KohlerCatalogService, resetKohlerBlockForTests } from './kohler-catalog.service';
import { OfficialSourceCacheService } from './official-source-cache.service';
import { OfficialPartIndexService } from './official-part-index.service';
import { parseKohlerCsv } from '../utils/kohler-csv';

// HTML e SVG INVENTADOS, no desenho de dados da página real. Códigos, nomes e coordenadas não são de nenhum motor.
const IMG = 'https://partnersportal.kohlerpower.it/servicepartcatalogueimages/gasoline/ZZ000_01.svg';
const SVG = `<svg viewBox="0 0 400 200"><text transform="translate(100 100)">1</text><text transform="translate(200 100)">9</text></svg>`;
const row = (pos: string, code: string, name: string) => `<tr><td data-label="${pos}"><span>${pos}</span></td><td></td><td></td>`
  + `<td><span>${code}</span></td><td></td><td><span>${name}</span></td><td></td><td>2</td><td></td><td></td></tr>`;
const PAGE = `<span>Spec</span>&nbsp;ZZ100-0001 <span>Description</span>&nbsp;ZZ100 - Motor de Teste
<button data-target="#part-finder-101-nav-item">Eixo Teste</button>
<button data-target="#part-finder-102-nav-item">Bloco Teste</button>
<img class="part-finder-image-with-alternative" src="${IMG}"/>
<div class="kp-app-part-table-container"><div class="kp-app-part-table-title"><h4>Eixo Teste - Group: 01</h4></div>
<table><tbody>${row('1', '00 000 01-S', 'EIXO')}</tbody></table></div>`;

/** O cache de verdade fica no Postgres; aqui ele só chama o carregador. */
function bypassCache() {
  mock.method(OfficialSourceCacheService, 'get', async (_key: string, _options: unknown, loader: () => Promise<unknown>) => ({ value: await loader(), state: 'MISS' }));
}

describe('catálogo Kohler: serviço', () => {
  afterEach(() => {
    mock.restoreAll();
    resetKohlerBlockForTests();
  });

  it('spec inválido nunca chega à rede (o spec entra na URL)', async () => {
    const fetchSpy = mock.method(globalThis, 'fetch', async () => { throw new Error('não deveria chamar a rede'); });
    bypassCache();
    const catalog = await KohlerCatalogService.forSpec('../../etc/passwd');
    assert.equal(catalog.description, null);
    assert.deepEqual(catalog.groups, []);
    assert.equal(await KohlerCatalogService.group('XX', '101'), null);
    assert.equal(await KohlerCatalogService.group('ZZ100-0001', '../1'), null);
    assert.equal(fetchSpy.mock.callCount(), 0);
  });

  it('lê os grupos do motor e devolve o link oficial', async () => {
    bypassCache();
    mock.method(globalThis, 'fetch', async () => new Response(PAGE, { status: 200 }));
    const catalog = await KohlerCatalogService.forSpec('zz100-0001');
    assert.equal(catalog.spec, 'ZZ100-0001');
    assert.equal(catalog.description, 'ZZ100 - Motor de Teste');
    assert.deepEqual(catalog.groups.map(group => group.name), ['Eixo Teste', 'Bloco Teste']);
    assert.equal(new URL(catalog.catalogUrl).hostname, 'partnersportal.kohlerpower.it');
  });

  it('spec que a Kohler desconhece (página sem cabeçalho de motor) vira "sem catálogo", sem lançar', async () => {
    bypassCache();
    mock.method(globalThis, 'fetch', async () => new Response('<html>busca</html>', { status: 200 }));
    const catalog = await KohlerCatalogService.forSpec('ZZ100-0001');
    assert.equal(catalog.description, null);
    assert.deepEqual(catalog.groups, []);
  });

  it('o grupo traz peças, desenho com proporção e só as posições da tabela; e as peças vão para o índice "peça -> motor"', async () => {
    bypassCache();
    mock.method(globalThis, 'fetch', async (input: unknown) => (String(input).endsWith('.svg')
      ? new Response(SVG, { status: 200 })
      : new Response(PAGE, { status: 200 })));
    const record = mock.method(OfficialPartIndexService, 'record', async () => undefined);

    const group = await KohlerCatalogService.group('ZZ100-0001', '101');
    assert.ok(group);
    assert.equal(group.parts.length, 1);
    assert.equal(group.parts[0].partNumber, '00 000 01-S');
    assert.equal(group.referenceWidth, 400);
    assert.equal(group.referenceHeight, 200);
    assert.deepEqual(group.hotspots.map(spot => spot.position), ['1'], 'a posição 9 do desenho não está na tabela deste spec');

    assert.equal(record.mock.callCount(), 1);
    const [source, engine, parts] = record.mock.calls[0].arguments as unknown as [string, string, Array<{ partNumber: string; assembly: string | null; position: string | null }>];
    assert.equal(source, 'KOHLER');
    assert.equal(engine, 'ZZ100-0001', 'o motor gravado é o spec pedido, nunca deduzido do HTML');
    assert.deepEqual([parts[0].partNumber, parts[0].assembly, parts[0].position], ['00 000 01-S', 'Eixo Teste', '1']);
  });

  it('desenho de outro domínio não é baixado', async () => {
    bypassCache();
    const outro = PAGE.replace(IMG, 'https://atacante.example.com/x.svg');
    const fetchSpy = mock.method(globalThis, 'fetch', async () => new Response(outro, { status: 200 }));
    mock.method(OfficialPartIndexService, 'record', async () => undefined);
    const group = await KohlerCatalogService.group('ZZ100-0001', '101');
    assert.equal(group?.imageUrl, null);
    assert.equal(fetchSpy.mock.callCount(), 1, 'só a página da Kohler foi buscada');
  });

  // A Kohler tem trava anti-robô: 302 para validaterecaptcha depois de poucas leituras seguidas (medido). Nunca é "sem catálogo", nunca vai
  // para o cache de 7 dias, e o sistema não insiste.
  const captcha = () => new Response(null, { status: 302, headers: { location: '/customer/servicepartscatalogue/home/validaterecaptcha?OriginalActionUrl=%2Fx' } });

  it('trava anti-robô: o motor volta como INDISPONÍVEL (CAPTCHA), com o link oficial, e não como "sem catálogo"', async () => {
    bypassCache();
    mock.method(globalThis, 'fetch', async () => captcha());
    const catalog = await KohlerCatalogService.forSpec('ZZ100-0001');
    assert.equal(catalog.unavailable, 'CAPTCHA');
    assert.equal(catalog.description, null);
    assert.equal(new URL(catalog.catalogUrl).hostname, 'partnersportal.kohlerpower.it');
  });

  it('trava anti-robô: o servidor para de insistir por um tempo (um pedido só, o resto nem sai)', async () => {
    bypassCache();
    const fetchSpy = mock.method(globalThis, 'fetch', async () => captcha());
    await KohlerCatalogService.forSpec('ZZ100-0001');
    await KohlerCatalogService.forSpec('ZZ100-0001');
    const group = await KohlerCatalogService.group('ZZ100-0001', '102');
    assert.equal(fetchSpy.mock.callCount(), 1, 'depois do bloqueio nenhuma consulta nova vai à Kohler');
    assert.equal(group?.unavailable, 'CAPTCHA');
    assert.deepEqual(group?.parts, []);
  });

  it('trava anti-robô no grupo: nada é indexado nem guardado', async () => {
    bypassCache();
    mock.method(globalThis, 'fetch', async () => captcha());
    const record = mock.method(OfficialPartIndexService, 'record', async () => undefined);
    const group = await KohlerCatalogService.group('ZZ100-0001', '101');
    assert.equal(group?.unavailable, 'CAPTCHA');
    assert.equal(record.mock.callCount(), 0);
  });

  it('o desenho bloqueado derruba o grupo inteiro: meia vista guardada por 7 dias seria pior que nenhuma', async () => {
    bypassCache();
    mock.method(globalThis, 'fetch', async (input: unknown) => (String(input).endsWith('.svg') ? captcha() : new Response(PAGE, { status: 200 })));
    const record = mock.method(OfficialPartIndexService, 'record', async () => undefined);
    const group = await KohlerCatalogService.group('ZZ100-0001', '101');
    assert.equal(group?.unavailable, 'CAPTCHA');
    assert.equal(record.mock.callCount(), 0);
  });

  it('erro 503 da Kohler é INDISPONÍVEL (ERRO), não "sem catálogo", e não aciona o freio do captcha', async () => {
    bypassCache();
    const fetchSpy = mock.method(globalThis, 'fetch', async () => new Response('fora', { status: 503 }));
    const catalog = await KohlerCatalogService.forSpec('ZZ100-0001');
    assert.equal(catalog.unavailable, 'ERRO');
    assert.equal(fetchSpy.mock.callCount(), 1, 'sem segunda tentativa escondida atrás do cache');
    mock.restoreAll();
    bypassCache();
    mock.method(globalThis, 'fetch', async () => new Response(PAGE, { status: 200 }));
    assert.equal((await KohlerCatalogService.forSpec('ZZ100-0001')).description, 'ZZ100 - Motor de Teste', 'depois do erro a próxima consulta funciona');
  });

  it('redirect que não é o captcha (spec desconhecido volta para a busca) continua sendo "sem catálogo"', async () => {
    bypassCache();
    mock.method(globalThis, 'fetch', async () => new Response(null, { status: 302, headers: { location: '/customer/servicepartscatalogue/' } }));
    const catalog = await KohlerCatalogService.forSpec('ZZ100-0001');
    assert.equal(catalog.unavailable, undefined);
    assert.equal(catalog.description, null);
  });

  // ---- CSV do motor inteiro: uma chamada indexa tudo e serve de lista de reserva ----
  const NL = String.fromCharCode(10);
  const csvText = (spec: string) => [
    `Spare parts catalog : ${spec}`, '', 'Last update 06/10/2026', '', 'Code;Description', '01;Eixo Teste', '02;Bloco Teste', '',
    '01 - Eixo Teste', '', 'Pos;Kit;Included in;Part #;Description;Note;QTY;Tech info', '1;;;00 000 01-S;EIXO COMPLETO;;1;', '2;;;00 000 02-S;CHAVETA;;2;',
    '', '02 - Bloco Teste', '', 'Pos;Kit;Included in;Part #;Description;Note;QTY;Tech info', '1;;;00 000 09-S;PARAFUSO-DISCONTINUED;;4;', '',
  ].join(NL);
  const flush = async () => { for (let i = 0; i < 5; i += 1) await new Promise(resolve => setImmediate(resolve)); };

  it('ao ler o catálogo do motor, o motor INTEIRO entra no índice com uma chamada (CSV), com o grupo de cada peça', async () => {
    bypassCache();
    mock.method(globalThis, 'fetch', async (input: unknown) => (String(input).includes('exportcsv') ? new Response(csvText('ZZ100-0001'), { status: 200 }) : new Response(PAGE, { status: 200 })));
    const record = mock.method(OfficialPartIndexService, 'record', async () => undefined);
    await KohlerCatalogService.forSpec('ZZ100-0001');
    await flush();
    assert.equal(record.mock.callCount(), 1);
    const [source, engine, parts] = record.mock.calls[0].arguments as unknown as [string, string, Array<{ partNumber: string; assembly: string | null }>];
    assert.equal(source, 'KOHLER');
    assert.equal(engine, 'ZZ100-0001');
    assert.deepEqual(parts.map(part => [part.partNumber, part.assembly]), [['00 000 01-S', 'Eixo Teste'], ['00 000 02-S', 'Eixo Teste'], ['00 000 09-S', 'Bloco Teste']]);
  });

  it('CSV de OUTRO spec nunca é indexado sob o spec pedido', async () => {
    bypassCache();
    mock.method(globalThis, 'fetch', async () => new Response(csvText('ZZ999-0009'), { status: 200 }));
    const record = mock.method(OfficialPartIndexService, 'record', async () => undefined);
    await KohlerCatalogService.indexWholeEngine('ZZ100-0001');
    assert.equal(record.mock.callCount(), 0);
  });

  it('página de verificação no lugar do CSV não indexa nada e não lança', async () => {
    bypassCache();
    mock.method(globalThis, 'fetch', async () => new Response('<html>verifique</html>', { status: 200 }));
    const record = mock.method(OfficialPartIndexService, 'record', async () => undefined);
    await KohlerCatalogService.indexWholeEngine('ZZ100-0001');
    assert.equal(record.mock.callCount(), 0);
  });

  it('trava anti-robô na página do grupo COM o CSV já guardado: o balcão ainda recebe a lista de peças, marcada como parcial', async () => {
    mock.method(OfficialSourceCacheService, 'get', async (_key: string, options: { resourceType: string }, loader: () => Promise<unknown>) => (
      options.resourceType === 'CSV'
        ? { value: parseKohlerCsv(csvText('ZZ100-0001')), state: 'HIT' }
        : { value: await loader(), state: 'MISS' }
    ));
    mock.method(globalThis, 'fetch', async () => captcha());
    mock.method(OfficialPartIndexService, 'record', async () => undefined);
    const group = await KohlerCatalogService.group('ZZ100-0001', '101');
    assert.equal(group?.unavailable, 'CAPTCHA');
    assert.equal(group?.partial, true);
    assert.deepEqual(group?.parts.map(part => part.partNumber), ['00 000 01-S', '00 000 02-S']);
    assert.equal(group?.imageUrl, null, 'sem desenho: o CSV não traz');
    const other = await KohlerCatalogService.group('ZZ100-0001', '102');
    assert.equal(other?.parts[0].discontinued, true, 'a marca de fora de linha do CSV passa adiante');
  });

  it('trava anti-robô SEM o CSV guardado: nada de lista inventada, só o aviso', async () => {
    bypassCache();
    mock.method(globalThis, 'fetch', async () => captcha());
    const group = await KohlerCatalogService.group('ZZ100-0001', '101');
    assert.equal(group?.unavailable, 'CAPTCHA');
    assert.deepEqual(group?.parts, []);
    assert.equal(group?.partial, undefined);
  });
});
