import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { KohlerCatalogService } from './kohler-catalog.service';
import { OfficialSourceCacheService } from './official-source-cache.service';
import { OfficialPartIndexService } from './official-part-index.service';

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
  afterEach(() => mock.restoreAll());

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
});
