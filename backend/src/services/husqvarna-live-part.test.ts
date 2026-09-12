import assert from 'node:assert/strict';
import test, { TestContext } from 'node:test';
import { HusqvarnaLivePartService } from './husqvarna-live-part.service';
import { HusqvarnaOfficialDetailService } from './husqvarna-official-detail.service';
import { HusqvarnaReplacementHistoryService, parseSparePartReplacementHistory } from './husqvarna-replacement-history.service';
import { HusqvarnaScraperService } from './husqvarna-scraper.service';

const detail = {
  partNumber: '516572700', name: 'TENSOR DA FAIXA', description: 'BELT TENSIONER',
  commercialReference: null, url: null, imageUrl: null, specifications: { netWeight: '170 g' }, fitsTo: [],
};
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
  const mocks = setup(t);
  const result = await HusqvarnaLivePartService.getPart('516 57 27-00');
  assert.equal(result?.name, 'TENSOR DA FAIXA');
  assert.equal(result?.replacedBy, '533040223');
  assert.deepEqual(result?.specifications, { netWeight: '170 g' });
  assert.equal(result?.originalPartUrl, 'https://portal.husqvarnagroup.com/br/spare-parts/?part=516572700');
  assert.equal(mocks.scraper.mock.callCount(), 0);
});

test('official latest code overrides stale replacement even when detail needs HTML', async t => {
  const mocks = setup(t);
  mocks.direct.mock.mockImplementation(async () => null);
  mocks.scraper.mock.mockImplementation(async () => ({ name: 'TENSOR', originalPartUrl: '', replacedBy: '516572700' }));
  const result = await HusqvarnaLivePartService.getPart('533040223');
  assert.equal(result?.name, 'TENSOR');
  assert.equal(result?.replacedBy, undefined);
  assert.equal(mocks.scraper.mock.callCount(), 1);
});

test('unavailable official history preserves HTML fallback and direct applications', async t => {
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
  const mocks = setup(t);
  mocks.direct.mock.mockImplementation(async () => null);
  assert.equal(await HusqvarnaLivePartService.getPart('516572700'), null);
  assert.equal(await HusqvarnaLivePartService.getPart('327P5x'), null);
  assert.equal(mocks.direct.mock.callCount(), 1);
  assert.equal(mocks.scraper.mock.callCount(), 1);
});
