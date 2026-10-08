import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { parsePngSize, parsePublicSupportArticle, probeImageSize } from './husqvarna-public-site.service';
import { HusqvarnaOfficialDetailService, buildIplSections } from './husqvarna-official-detail.service';

// Dados inventados: o desenho de dados é o da API pública da Husqvarna; nomes, números e imagem não são de nenhum produto real.
const IMAGE = 'https://p3.aprimocdn.net/husqvarna/00000000-0000-0000-0000-000000000000/DESENHO-TESTE.png';

/** Host da URL, comparado por igualdade (nunca por trecho do texto). */
const hostOf = (url: string): string => new URL(url).hostname;

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

const publicPayload = {
  site: {
    articles: {
      byIds: [{
        id: '900000009',
        name: { shortName: 'Soprador de teste X1' },
        product: { url: '/br/sopradores-de-folhas/soprador-de-teste-x1/', category: { name: 'Sopradores' } },
        ipls: [
          {
            id: 'HVA_PL-000000001',
            name: 'MOTOR',
            image: IMAGE,
            articles: [
              { coordinates: ['244;1345;265;1387'], quantity: 1, id: '900000101', name: 'PEÇA UM', number: 1, comment: null, url: 'https://www.husqvarna.com/br/pecas-sobressalentes/900000101/' },
              { coordinates: ['499;1537;520;1578'], quantity: 2, id: '900000102', name: 'PEÇA DOIS', number: 2, comment: null, url: 'https://www.husqvarna.com/br/pecas-sobressalentes/900000102/' },
            ],
          },
          { id: 'HVA_PL-000000002', name: 'SEM PEÇAS', image: IMAGE, articles: [] },
        ],
      }],
    },
  },
};

describe('site público da Husqvarna como segunda fonte da vista explodida', () => {
  afterEach(() => mock.restoreAll());

  it('lê o tamanho de um PNG pelos 24 primeiros bytes e recusa o que não é PNG', () => {
    assert.deepEqual(parsePngSize(pngHeader(2481, 3508)), { width: 2481, height: 3508 });
    assert.equal(parsePngSize(new Uint8Array(32)), null);
    assert.equal(parsePngSize(pngHeader(2481, 3508).slice(0, 10)), null);
  });

  it('lê o artigo e descarta seção sem peças', () => {
    const parsed = parsePublicSupportArticle(publicPayload, '900000009');
    assert.ok(parsed);
    assert.equal(parsed.productName, 'Soprador de teste X1');
    assert.equal(parsed.categoryName, 'Sopradores');
    assert.equal(parsed.sections.length, 1);
  });

  it('artigo sem vista explodida ou sem nome não vira resultado', () => {
    assert.equal(parsePublicSupportArticle({ site: { articles: { byIds: [null] } } }, '900000009'), null);
    assert.equal(parsePublicSupportArticle({ site: { articles: { byIds: [{ id: '1', name: { shortName: 'X' }, ipls: [] }] } } }, '900000009'), null);
    assert.equal(parsePublicSupportArticle({ site: { articles: { byIds: [{ id: '1', name: {}, ipls: [{ id: 'HVA_PL-1', name: 'A', articles: [{ id: '900000101' }] }] }] } } }, '900000009'), null);
  });

  it('as seções saem no mesmo formato do Portal: código, posição, quantidade, coordenadas', () => {
    const parsed = parsePublicSupportArticle(publicPayload, '900000009')!;
    const sections = buildIplSections(parsed.sections.map(section => ({ ...section, referenceWidth: 2481, referenceHeight: 3508 })), '900000009');
    assert.equal(sections.length, 1);
    assert.equal(sections[0].name, 'MOTOR');
    assert.equal(sections[0].referenceWidth, 2481);
    assert.deepEqual(sections[0].parts.map(part => [part.position, part.partNumber, part.quantity]), [['1', '900000101', 1], ['2', '900000102', 2]]);
    assert.equal(sections[0].parts[0].coordinates, '244;1345;265;1387');
  });

  it('seção de outro prefixo de catálogo (CLT_PL, dos cortadores de grama) conta; id fora do formato não', () => {
    const parte = { coordinates: ['1;1;2;2'], quantity: 1, id: '900000201', name: 'PEÇA', number: 1, comment: null, url: null };
    const sections = buildIplSections([
      { id: 'CLT_PL-000000204', name: 'POWER HEAD', image: IMAGE, articles: [parte] },
      { id: 'HVA_PL-000000001', name: 'MOTOR', image: IMAGE, articles: [parte] },
      { id: '../../etc/passwd', name: 'INVÁLIDA', image: IMAGE, articles: [parte] },
      { id: 'javascript:alert(1)', name: 'INVÁLIDA', image: IMAGE, articles: [parte] },
      { id: 'X_PL-1', name: '', image: IMAGE, articles: [parte] },
    ], '900000009');
    assert.deepEqual(sections.map(section => section.id), ['CLT_PL-000000204', 'HVA_PL-000000001']);
  });

  it('não baixa imagem de domínio que não é da Husqvarna', async () => {
    const fetchSpy = mock.method(globalThis, 'fetch', async () => { throw new Error('não deveria chamar a rede'); });
    assert.equal(await probeImageSize('https://atacante.example.com/desenho.png'), null);
    assert.equal(fetchSpy.mock.callCount(), 0);
  });

  it('servidor que ignora o Range (200 com o arquivo todo) não vira tamanho', async () => {
    mock.method(globalThis, 'fetch', async () => new Response(Buffer.from(pngHeader(10, 10)), { status: 200 }));
    assert.equal(await probeImageSize(IMAGE), null);
  });

  it('Portal sem o artigo: o detalhe da máquina vem do site público, com a vista explodida e a fonte marcada', async () => {
    const calls: string[] = [];
    mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (hostOf(url) === 'portal.husqvarnagroup.com') {
        return new Response(JSON.stringify({ data: { site: { articles: { byIds: [null] } } } }), { status: 200 });
      }
      if (hostOf(url) === 'www.husqvarna.com' && new URL(url).pathname === '/hbd/graphql') {
        assert.match(String(init?.body), /hbd-br-pt-br/);
        return new Response(JSON.stringify({ data: publicPayload }), { status: 200 });
      }
      return new Response(Buffer.from(pngHeader(2481, 3508)), { status: 206 });
    });
    const details = await HusqvarnaOfficialDetailService.getProductDetails('900000009');
    assert.ok(details, 'o site público deveria ter respondido');
    assert.equal(details.iplSource, 'PUBLIC_SITE');
    assert.equal(details.productName, 'Soprador de teste X1');
    assert.equal(details.iplSections[0].referenceHeight, 3508);
    assert.equal(details.iplSections[0].parts.length, 2);
    assert.ok(calls.some(url => hostOf(url) === 'portal.husqvarnagroup.com'), 'o Portal é consultado primeiro');
  });

  it('Portal e site público sem o artigo: continua sem resultado e não repete a consulta por um tempo', async () => {
    let publicCalls = 0;
    mock.method(globalThis, 'fetch', async (input: unknown) => {
      const url = String(input);
      if (hostOf(url) === 'www.husqvarna.com' && new URL(url).pathname === '/hbd/graphql') publicCalls += 1;
      return new Response(JSON.stringify({ data: { site: { articles: { byIds: [null] } } } }), { status: 200 });
    });
    assert.equal(await HusqvarnaOfficialDetailService.getProductDetails('900000010'), null);
    const depois = publicCalls;
    assert.ok(depois >= 1);
    assert.equal(await HusqvarnaOfficialDetailService.getProductDetails('900000010'), null);
    assert.equal(publicCalls, depois, 'o segundo pedido não deveria consultar o site público de novo');
  });
});
