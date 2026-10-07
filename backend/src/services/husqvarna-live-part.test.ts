import assert from 'node:assert/strict';
import test, { TestContext } from 'node:test';
import { HusqvarnaLivePartService } from './husqvarna-live-part.service';
import { HusqvarnaOfficialDetailService } from './husqvarna-official-detail.service';
import { HusqvarnaReplacementHistoryService, parseSparePartReplacementHistory } from './husqvarna-replacement-history.service';
import { HusqvarnaScraperService } from './husqvarna-scraper.service';
import { buildOfficialSourceCacheKey, OfficialSourceCacheService } from './official-source-cache.service';

const detail = {
  partNumber: '516572700', name: 'TENSOR DA FAIXA', description: 'BELT TENSIONER',
  commercialReference: null, url: null, imageUrl: null, specifications: { netWeight: '170 g' }, fitsTo: [],
};

async function clearLivePartCache(...codes: string[]) {
  await Promise.all(codes.map(code => OfficialSourceCacheService.invalidate(
    buildOfficialSourceCacheKey('HUSQVARNA', 'LIVE_PART', code.replace(/\D/g, '')),
  )));
}

function setup(t: TestContext) {
  const direct = t.mock.method(HusqvarnaOfficialDetailService, 'getSparePartDetails', async () => detail);
  const history = t.mock.method(HusqvarnaReplacementHistoryService, 'getReplacementHistory', async (code: string) =>
    parseSparePartReplacementHistory({ site: { spareParts: { byId: { replacementHistory: [
      { unformattedArticleNumber: '533040223' }, { unformattedArticleNumber: '516572700' },
    ] } } } }, code));
  const scraper = t.mock.method(HusqvarnaScraperService, 'fetchLiveData', async () => null);
  return { direct, history, scraper };
}

test('legacy live-data response uses the official replacement without scraping', async t => {
  await clearLivePartCache('516572700');
  const mocks = setup(t);
  const result = await HusqvarnaLivePartService.getPart('516 57 27-00');
  assert.equal(result?.name, 'TENSOR DA FAIXA');
  assert.equal(result?.replacedBy, '533040223');
  assert.deepEqual(result?.specifications, { netWeight: '170 g' });
  assert.equal(result?.originalPartUrl, 'https://portal.husqvarnagroup.com/br/spare-parts/?part=516572700');
  assert.equal(mocks.scraper.mock.callCount(), 0);
});

test('official latest code overrides stale replacement even when detail needs HTML', async t => {
  await clearLivePartCache('533040223');
  const mocks = setup(t);
  mocks.direct.mock.mockImplementation(async () => null);
  mocks.scraper.mock.mockImplementation(async () => ({ name: 'TENSOR', originalPartUrl: '', replacedBy: '516572700' }));
  const result = await HusqvarnaLivePartService.getPart('533040223');
  assert.equal(result?.name, 'TENSOR');
  assert.equal(result?.replacedBy, undefined);
  assert.equal(mocks.scraper.mock.callCount(), 1);
});

test('unavailable official history preserves HTML fallback and direct applications', async t => {
  await clearLivePartCache('516572700');
  const mocks = setup(t);
  mocks.direct.mock.mockImplementation(async () => ({ ...detail, fitsTo: ['Official model'] }));
  mocks.history.mock.mockImplementation(async () => null);
  mocks.scraper.mock.mockImplementation(async () => ({ name: 'HTML', originalPartUrl: '', replacedBy: '533040223' }));
  const result = await HusqvarnaLivePartService.getPart('516572700');
  assert.equal(result?.name, detail.name);
  assert.equal(result?.replacedBy, '533040223');
  assert.deepEqual(result?.fitsTo, ['Official model']);
});

test('missing detail in both sources returns null and invalid codes do not call upstream', async t => {
  await clearLivePartCache('516572700');
  const mocks = setup(t);
  mocks.direct.mock.mockImplementation(async () => null);
  assert.equal(await HusqvarnaLivePartService.getPart('516572700'), null);
  assert.equal(await HusqvarnaLivePartService.getPart('327P5x'), null);
  assert.equal(mocks.direct.mock.callCount(), 1);
  assert.equal(mocks.scraper.mock.callCount(), 1);
});

test('cadeia longa: o código pedido na Husqvarna é o MAIS RECENTE, não o próximo passo', async t => {
  await clearLivePartCache('506027201');
  // O resultado simulado não pode ficar no cache persistente depois do teste (a próxima leitura real o veria).
  t.after(() => clearLivePartCache('506027201'));
  const mocks = setup(t);
  // Caso real medido no portal: 506027201 → 506027207 → … → 587329503 (o passo seguinte também já foi trocado).
  mocks.history.mock.mockImplementation(async (code: string) =>
    parseSparePartReplacementHistory({ site: { spareParts: { byId: { replacementHistory: [
      { unformattedArticleNumber: '587329503' }, { unformattedArticleNumber: '587329502' },
      { unformattedArticleNumber: '506027207' }, { unformattedArticleNumber: '506027201' },
    ] } } } }, code));
  const result = await HusqvarnaLivePartService.getPart('506027201');
  assert.equal(result?.replacedBy, '587329503', 'mostrar 506027207 faria o balcão pedir um código que já foi trocado');
  assert.deepEqual(result?.replacementChain, [
    { from: '506027201', to: '506027207' },
    { from: '506027207', to: '587329502' },
    { from: '587329502', to: '587329503' },
  ]);
});

test('código que já é o mais recente não traz substituto nem cadeia', async t => {
  await clearLivePartCache('533040223');
  t.after(() => clearLivePartCache('533040223'));
  const mocks = setup(t);
  const result = await HusqvarnaLivePartService.getPart('533040223');
  assert.equal(result?.replacedBy, undefined);
  assert.equal(result?.replacementChain, undefined);
  assert.equal(mocks.history.mock.callCount(), 1);
});
