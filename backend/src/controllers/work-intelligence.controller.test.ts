import assert from 'node:assert/strict';
import test, { TestContext } from 'node:test';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { WorkIntelligenceController } from './work-intelligence.controller';
import { HusqvarnaLivePartService } from '../services/husqvarna-live-part.service';
import { HusqvarnaPortalGraphqlService } from '../services/husqvarna-portal-graphql.service';

function setup(t: TestContext) {
  const productSearch = t.mock.method(
    HusqvarnaPortalGraphqlService,
    'searchProductByPnc',
    async () => null,
  );
  const productDetails = t.mock.method(
    HusqvarnaPortalGraphqlService,
    'getProductDetailsByPnc',
    async () => null,
  );
  const livePart = t.mock.method(HusqvarnaLivePartService, 'getPart', async () => null);
  return { productSearch, productDetails, livePart };
}

async function request(query: string) {
  let status = 200;
  let body: any;
  const res = {
    status(value: number) { status = value; return this; },
    json(value: unknown) { body = value; return this; },
  };
  await new WorkIntelligenceController().officialFallback({
    query: { q: query },
    user: { id: 'test-user', role: 'ADMIN', tenantId: 'test-tenant' },
  } as unknown as AuthenticatedRequest, res as unknown as Response);
  return { status, body };
}

test('confirmed product PNC never starts the part fallback', async t => {
  const mocks = setup(t);
  mocks.productSearch.mock.mockImplementation(async () => ({
    pnc: '967983916',
    productName: 'HUSQVARNA 540i XP',
    discontinued: false,
    portalUrl: 'https://portal.husqvarnagroup.com/br/test/?article=967983916',
    category: { name: 'Motosserras' },
  }) as any);

  const { status, body } = await request('967983916');

  assert.equal(status, 200);
  assert.equal(body.result.kind, 'PRODUCT_CATALOG');
  assert.equal(body.result.pnc, '967983916');
  assert.equal(mocks.livePart.mock.callCount(), 0);
  assert.equal(mocks.productSearch.mock.callCount(), 1);
  assert.equal(mocks.productDetails.mock.callCount(), 1);
});

test('numeric code falls back to the part service only after product GraphQL misses', async t => {
  const mocks = setup(t);
  mocks.livePart.mock.mockImplementation(async () => ({
    name: 'TENSOR DA FAIXA',
    originalPartUrl: 'https://portal.husqvarnagroup.com/br/spare-parts/?part=516572700',
    replacedBy: '533040223',
    fitsTo: ['HUSQVARNA 327P5x'],
  }) as any);

  const { status, body } = await request('516572700');

  assert.equal(status, 200);
  assert.equal(body.result.kind, 'PART');
  assert.equal(body.result.partNumber, '516572700');
  assert.equal(body.result.replacedBy, '533040223');
  assert.equal(mocks.productSearch.mock.callCount(), 1);
  assert.equal(mocks.productDetails.mock.callCount(), 1);
  assert.equal(mocks.livePart.mock.callCount(), 1);
});
