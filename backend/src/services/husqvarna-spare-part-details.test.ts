import assert from 'node:assert/strict';
import test from 'node:test';
import { HusqvarnaOfficialDetailService, parseOfficialSparePartDetails } from './husqvarna-official-detail.service';

// Reduced getSparePart response observed in the BR Portal on 2026-09-12.
const part = {
  articleNumberFormatted: '576 01 98-01',
  name: 'CARBURADOR',
  articleDescription: null,
  mainImage: { url: 'https://media.husqvarnagroup.com/image/H710-2953.png' },
  url: '/br/spare-parts/?part=576019801',
  specifications: { ean: '7393080482822', netWeight: '104 g', articleDescription: 'CARBURETTOR HQ 2', length: null },
  alsoUsedIn: [
    { name: { longName: 'HUSQVARNA 327P5x' }, primaryArticle: { id: '965195201' } },
    { name: { longName: 'HUSQVARNA 327RJx' }, primaryArticle: { id: '965194301' } },
  ],
};
const payload = (value: unknown) => ({ site: { spareParts: { byId: value } } });

test('getSparePart preserves official EAN, specifications and model applications', () => {
  const result = parseOfficialSparePartDetails(payload(part), '576 01 98-01');
  assert.ok(result);
  assert.equal(result.partNumber, '576019801');
  assert.equal(result.description, 'CARBURETTOR HQ 2');
  assert.deepEqual(result.specifications, { ean: '7393080482822', netWeight: '104 g', articleDescription: 'CARBURETTOR HQ 2' });
  assert.deepEqual(result.fitsTo, ['HUSQVARNA 327P5x', 'HUSQVARNA 327RJx']);
  assert.equal(result.url, 'https://portal.husqvarnagroup.com/br/spare-parts/?part=576019801');
});

test('rejects missing, malformed or mismatched part identity', () => {
  for (const value of [null, [], {}, { ...part, articleNumberFormatted: '533040223' }, { ...part, name: {} }]) {
    assert.equal(parseOfficialSparePartDetails(payload(value), '576019801'), null);
  }
  assert.equal(parseOfficialSparePartDetails(payload(part), '327P5x'), null);
});

test('handles sparse details without inventing applications or stringifying objects', () => {
  const result = parseOfficialSparePartDetails(payload({
    ...part,
    specifications: { ean: {}, netWeight: null },
    alsoUsedIn: [null, {}, { name: { longName: ' ' } }, ...part.alsoUsedIn, ...part.alsoUsedIn],
  }), '576019801');
  assert.ok(result);
  assert.equal(result.specifications, null);
  assert.deepEqual(result.fitsTo, ['HUSQVARNA 327P5x', 'HUSQVARNA 327RJx']);
});

test('queries by exact code, caches successful detail and retries GraphQL failures', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(String(init.body));
    assert.equal(request.operationName, 'getSparePart');
    assert.deepEqual(request.variables, { siteName: 'b2b-br-pt-br', sparePartId: '576019801' });
    return new Response(JSON.stringify({ data: payload(part), errors: [{ message: 'temporary upstream failure' }] }));
  });
  assert.equal(await HusqvarnaOfficialDetailService.getSparePartDetails('576019801'), null);
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ data: payload(part) })));
  const first = await HusqvarnaOfficialDetailService.getSparePartDetails('576019801');
  assert.ok(first);
  assert.strictEqual(await HusqvarnaOfficialDetailService.getSparePartDetails('576 01 98-01'), first);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('transport failures return null for controller fallback', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  assert.equal(await HusqvarnaOfficialDetailService.getSparePartDetails('503892401'), null);
  fetchMock.mock.mockImplementation(async () => { throw new Error('network failure'); });
  assert.equal(await HusqvarnaOfficialDetailService.getSparePartDetails('503892401'), null);
  assert.equal(fetchMock.mock.callCount(), 2);
});
