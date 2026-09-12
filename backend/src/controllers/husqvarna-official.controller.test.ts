import assert from 'node:assert/strict';
import test, { TestContext } from 'node:test';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/prisma';
import { HusqvarnaOfficialController } from './husqvarna-official.controller';
import { HusqvarnaOfficialDetailService } from '../services/husqvarna-official-detail.service';
import { HusqvarnaReplacementHistoryService, parseSparePartReplacementHistory } from '../services/husqvarna-replacement-history.service';
import { HusqvarnaScraperService } from '../services/husqvarna-scraper.service';

const detail = {
  partNumber: '516572700', name: 'TENSOR DA FAIXA', description: 'BELT TENSIONER',
  commercialReference: null, url: null, imageUrl: null,
  specifications: { netWeight: '170 g' }, fitsTo: ['HUSQVARNA 327P5x'],
};
const history = (code: string, codes = ['533040223', '516572700']) => parseSparePartReplacementHistory({
  site: { spareParts: { byId: { replacementHistory: codes.map(unformattedArticleNumber => ({ unformattedArticleNumber })) } } },
}, code);

function setup(t: TestContext) {
  const findUnique = prisma.masterPart.findUnique;
  prisma.masterPart.findUnique = (async () => null) as unknown as typeof findUnique;
  t.after(() => { prisma.masterPart.findUnique = findUnique; });
  const direct = t.mock.method(HusqvarnaOfficialDetailService, 'getSparePartDetails', async () => detail);
  const search = t.mock.method(HusqvarnaOfficialDetailService, 'searchSparePart', async () => null);
  const replacement = t.mock.method(HusqvarnaReplacementHistoryService, 'getReplacementHistory', async (code: string) => history(code));
  const scraper = t.mock.method(HusqvarnaScraperService, 'fetchLiveData', async () => null);
  return { direct, search, replacement, scraper };
}

async function request(code = '516572700') {
  let status = 200;
  let body: any;
  const res = { status(value: number) { status = value; return this; }, json(value: unknown) { body = value; } };
  await new HusqvarnaOfficialController().partDetails({
    params: { code }, user: { id: 'test-user', role: 'ADMIN', tenantId: 'test-tenant' },
  } as unknown as AuthenticatedRequest, res as unknown as Response);
  return { status, body };
}

test('official detail and history serve the old part without HTML or recursive search', async t => {
  const mocks = setup(t);
  const { status, body } = await request();
  assert.equal(status, 200);
  assert.equal(body.part.replacedBy, '533040223');
  assert.equal(body.part.replacementSource, 'HUSQVARNA_GRAPHQL');
  assert.deepEqual(body.part.replacementChain, [{ from: '516572700', to: '533040223' }]);
  assert.deepEqual(body.part.fitsTo, detail.fitsTo);
  assert.deepEqual(body.part.specifications, detail.specifications);
  assert.equal(body.part.sources.portalScraper, false);
  assert.equal(mocks.scraper.mock.callCount(), 0);
  assert.equal(mocks.search.mock.callCount(), 0);
});

test('latest official code has no replacement and does not trigger the scraper', async t => {
  const mocks = setup(t);
  mocks.direct.mock.mockImplementation(async () => ({ ...detail, partNumber: '533040223' }));
  const { body } = await request('533040223');
  assert.equal(body.part.replacedBy, null);
  assert.deepEqual(body.part.replacementChain, []);
  assert.equal(body.part.latestReplacementPartNumber, '533040223');
  assert.equal(mocks.scraper.mock.callCount(), 0);
});

test('unavailable direct detail falls back to search and HTML but official history wins', async t => {
  const mocks = setup(t);
  mocks.direct.mock.mockImplementation(async () => null);
  mocks.scraper.mock.mockImplementation(async () => ({ name: 'Fallback', originalPartUrl: '', replacedBy: '999999999' }));
  const { status, body } = await request();
  assert.equal(status, 200);
  assert.equal(body.part.name, 'Fallback');
  assert.equal(body.part.replacedBy, '533040223');
  assert.equal(mocks.scraper.mock.callCount(), 1);
  assert.equal(mocks.search.mock.callCount(), 1);
});

test('missing history enables scraper fallback without discarding structured detail', async t => {
  const mocks = setup(t);
  mocks.replacement.mock.mockImplementation(async () => null);
  mocks.scraper.mock.mockImplementation(async (code: string) => code === '516572700'
    ? { name: 'Fallback', originalPartUrl: '', replacedBy: '533040223' } : null);
  const { body } = await request();
  assert.equal(body.part.name, detail.name);
  assert.deepEqual(body.part.specifications, detail.specifications);
  assert.equal(body.part.replacementSource, 'PORTAL_SCRAPER');
  assert.equal(body.part.replacedBy, '533040223');
});

test('empty official history retains fallback and missing sources remain 404', async t => {
  const mocks = setup(t);
  mocks.replacement.mock.mockImplementation(async code => history(code, []));
  assert.equal((await request()).body.part.replacementSource, null);
  assert.equal(mocks.scraper.mock.callCount(), 1);
  mocks.direct.mock.mockImplementation(async () => null);
  assert.equal((await request()).status, 404);
});
