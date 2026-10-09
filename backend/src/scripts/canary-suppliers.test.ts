import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { CHECKS, runWithRetry } from './canary-suppliers';

const kohler = CHECKS.find(check => check.name.startsWith('Kohler'))!;
const briggs = CHECKS.find(check => check.name.startsWith('Briggs'))!;

describe('vigia dos fornecedores', () => {
  afterEach(() => mock.restoreAll());

  it('página que ainda responde mas mudou de formato é "MUDOU" (e não repete a tentativa)', async () => {
    const fetchSpy = mock.method(globalThis, 'fetch', async () => new Response('<html><body>nova página sem tabela</body></html>', { status: 200 }));
    const outcome = await runWithRetry(kohler, 0);
    assert.equal(outcome.state, 'MUDOU');
    assert.match(outcome.detail, /cabeçalho do motor/);
    assert.equal(fetchSpy.mock.callCount(), 1, 'mudança de formato não melhora tentando de novo');
  });

  it('site fora do ar (rede ou HTTP 503) é "FORA_DO_AR" depois de 3 tentativas, e não é tratado como mudança de formato', async () => {
    const fetchSpy = mock.method(globalThis, 'fetch', async () => new Response('indisponível', { status: 503 }));
    const outcome = await runWithRetry(kohler, 0);
    assert.equal(outcome.state, 'FORA_DO_AR');
    assert.match(outcome.detail, /HTTP 503/);
    assert.equal(fetchSpy.mock.callCount(), 3);
  });

  it('API da Briggs que muda a forma da resposta é "MUDOU"', async () => {
    mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ resultados: [] }), { status: 200 }));
    const outcome = await runWithRetry(briggs, 0);
    assert.equal(outcome.state, 'MUDOU');
    assert.match(outcome.detail, /Illustrated Parts List/);
  });

  it('PDF que vira página de erro é "MUDOU"', async () => {
    mock.method(globalThis, 'fetch', async (input: unknown) => (String(input).includes('manual-search')
      ? new Response(JSON.stringify({ value: [{ tc_DocType: 'Illustrated Parts List', tc_LanguageCode: ['English'], tc_RelativePath: '104M020002F1%7E_IPLURL_LO.pdf' }] }), { status: 200 })
      : new Response('<html>erro</html>', { status: 200 })));
    const outcome = await runWithRetry(briggs, 0);
    assert.equal(outcome.state, 'MUDOU');
    assert.match(outcome.detail, /não devolveu um PDF/);
  });

  it('um erro de rede na primeira tentativa que passa na segunda termina OK', async () => {
    let calls = 0;
    const outcome = await runWithRetry({ name: 'x', run: async () => { calls += 1; if (calls === 1) throw new Error('ECONNRESET'); return 'ok'; } }, 0);
    assert.equal(outcome.state, 'OK');
    assert.equal(calls, 2);
  });

  it('a página de verificação anti-robô da Kohler é "FORA_DO_AR", nunca "MUDOU" (não abre issue à toa)', async () => {
    mock.method(globalThis, 'fetch', async () => {
      const response = new Response('<html>verifique que você não é um robô</html>', { status: 200 });
      Object.defineProperty(response, 'url', { value: 'https://partnersportal.kohlerpower.it/customer/servicepartscatalogue/home/validaterecaptcha?x=1' });
      return response;
    });
    const outcome = await runWithRetry(kohler, 0);
    assert.equal(outcome.state, 'FORA_DO_AR');
    assert.match(outcome.detail, /reCAPTCHA/);
  });
});

describe('vigia do uso recomendado (site público da Husqvarna)', () => {
  afterEach(() => mock.restoreAll());
  const uso = CHECKS.find(check => check.name.includes('uso recomendado'))!;
  const resposta = (valores: Array<{ id: string; formattedValue: string; numericValue?: number }>) =>
    new Response(JSON.stringify({ data: { site: { articles: { byIds: [{ id: 'x', specificationValues: valores }] } } } }), { status: 200 });
  const motosserra = [
    { id: 'WEB_ChainsawSubGroup', formattedValue: 'Full time professional use chainsaws' },
    { id: 'TD32_1_metric', formattedValue: '38 cm', numericValue: 38 },
    { id: 'TD32_2_metric', formattedValue: '70 cm', numericValue: 70 },
  ];

  it('com os ids de sempre, passa e diz o que leu', async () => {
    mock.method(globalThis, 'fetch', async (_url: unknown, init?: { body?: string }) => (String(init?.body).includes('965801490') ? resposta(motosserra) : resposta([{ id: 'ART_647', formattedValue: 'Uso residencial intensivo' }])));
    const outcome = await runWithRetry(uso, 0);
    assert.equal(outcome.state, 'OK', outcome.detail);
    assert.match(outcome.detail, /38 a 70 cm/);
  });

  it('classe nova da Husqvarna (texto que não conhecemos) é "MUDOU", não passa em silêncio', async () => {
    mock.method(globalThis, 'fetch', async () => resposta([{ id: 'WEB_ChainsawSubGroup', formattedValue: 'Space chainsaws' }]));
    const outcome = await runWithRetry(uso, 0);
    assert.equal(outcome.state, 'MUDOU');
    assert.match(outcome.detail, /classe de uso da motosserra/);
  });

  it('id renomeado (a ficha vem sem o campo) é "MUDOU"', async () => {
    mock.method(globalThis, 'fetch', async () => resposta([{ id: 'OUTRO_ID', formattedValue: 'Full time professional use chainsaws' }]));
    const outcome = await runWithRetry(uso, 0);
    assert.equal(outcome.state, 'MUDOU');
  });

  it('o site fora do ar é FORA_DO_AR depois de 3 tentativas, nunca "MUDOU"', async () => {
    const spy = mock.method(globalThis, 'fetch', async () => new Response('indisponível', { status: 503 }));
    const outcome = await runWithRetry(uso, 0);
    assert.equal(outcome.state, 'FORA_DO_AR');
    assert.equal(spy.mock.callCount(), 3);
  });
});
