import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPortalCoverageCacheKey,
  isCacheablePortalCoverageOutcome,
  portalAuditToCoverageOutcome,
  portalCoverageRequestCacheState,
  resolvePortalCoverageOutcome,
} from './bounded-portal-coverage.service';
import { OfficialSourceCacheService } from './official-source-cache.service';
import type { PortalModelAudit } from './portal-model-audit.service';

function audit(overrides: Partial<PortalModelAudit>): PortalModelAudit {
  return {
    model: '445E',
    searchResultCount: 1,
    exactProductCount: 1,
    portalAvailableWhenSearchEmpty: null,
    products: [],
    ...overrides,
  };
}

test('promove para VERIFIED somente produto exato com IPL estruturada', () => {
  const outcome = portalAuditToCoverageOutcome(audit({
    products: [{
      title: 'HUSQVARNA 445 e-series TrioBrake',
      pnc: '965083236',
      portalUrl: 'https://portal.husqvarnagroup.com/br/motosserras/445-e-series-trio-brake/?article=965083236',
      detailResolved: true,
      iplSectionCount: 2,
      structuredPartCount: 27,
    }],
  }));

  assert.equal(outcome.state, 'VERIFIED');
  assert.equal(outcome.pnc, '965083236');
  assert.match(outcome.source || '', /portal\.husqvarnagroup\.com/);
});

test('não interpreta Portal indisponível como ausência de IPL', () => {
  const outcome = portalAuditToCoverageOutcome(audit({
    searchResultCount: 0,
    exactProductCount: 0,
    portalAvailableWhenSearchEmpty: false,
  }));

  assert.equal(outcome.state, 'INCONCLUSIVE');
  assert.match(outcome.note, /nenhuma ausência de IPL/i);
  assert.equal(isCacheablePortalCoverageOutcome(outcome), false);
});

test('diferencia busca válida sem match exato de indisponibilidade', () => {
  const emptySearch = portalAuditToCoverageOutcome(audit({
    searchResultCount: 0,
    exactProductCount: 0,
    portalAvailableWhenSearchEmpty: true,
  }));
  assert.equal(emptySearch.state, 'NO_EXACT_MATCH');
  assert.equal(isCacheablePortalCoverageOutcome(emptySearch), true);

  const nearbyResults = portalAuditToCoverageOutcome(audit({
    searchResultCount: 12,
    exactProductCount: 0,
  }));
  assert.equal(nearbyResults.state, 'NO_EXACT_MATCH');
});

test('mantém INCONCLUSIVE quando produto exato não resolve detalhes', () => {
  const outcome = portalAuditToCoverageOutcome(audit({
    products: [{
      title: 'HUSQVARNA 445 e-series TrioBrake',
      pnc: '965083236',
      portalUrl: null,
      detailResolved: false,
      iplSectionCount: null,
      structuredPartCount: null,
    }],
  }));

  assert.equal(outcome.state, 'INCONCLUSIVE');
  assert.equal(isCacheablePortalCoverageOutcome(outcome), false);
});

test('só conclui NO_IPL quando o detalhe exato resolveu sem peças estruturadas', () => {
  const outcome = portalAuditToCoverageOutcome(audit({
    products: [{
      title: 'HUSQVARNA 445 e-series TrioBrake',
      pnc: '965083236',
      portalUrl: null,
      detailResolved: true,
      iplSectionCount: 0,
      structuredPartCount: 0,
    }],
  }));

  assert.equal(outcome.state, 'NO_IPL');
  assert.equal(outcome.pnc, '965083236');
  assert.equal(isCacheablePortalCoverageOutcome(outcome), true);
});

test('resume o estado da requisição priorizando degradação e consulta externa', () => {
  assert.equal(portalCoverageRequestCacheState({ HIT: 8, STALE: 0, MISS: 0, FALLBACK: 0 }), 'HIT');
  assert.equal(portalCoverageRequestCacheState({ HIT: 6, STALE: 1, MISS: 0, FALLBACK: 0 }), 'STALE');
  assert.equal(portalCoverageRequestCacheState({ HIT: 6, STALE: 0, MISS: 2, FALLBACK: 0 }), 'MISS');
  assert.equal(portalCoverageRequestCacheState({ HIT: 5, STALE: 0, MISS: 2, FALLBACK: 1 }), 'FALLBACK');
  assert.equal(portalCoverageRequestCacheState({ HIT: 0, STALE: 0, MISS: 0, FALLBACK: 0 }), null);
});

test('cache key normaliza o modelo e permanece preso ao Portal BR', () => {
  assert.equal(buildPortalCoverageCacheKey('445 E'), buildPortalCoverageCacheKey('445E'));
  assert.notEqual(
    buildPortalCoverageCacheKey('445E'),
    buildPortalCoverageCacheKey('445E', 'b2b-us-en-us'),
  );
});

test('resultado conclusivo do Portal BR é reutilizado sem nova consulta externa', async () => {
  const model = 'CACHE445E';
  const key = buildPortalCoverageCacheKey(model);
  await OfficialSourceCacheService.invalidate(key);

  let calls = 0;
  const loader = async (): Promise<PortalModelAudit> => {
    calls += 1;
    return audit({
      model,
      products: [{
        title: 'HUSQVARNA CACHE445E',
        pnc: '965083236',
        portalUrl: 'https://portal.husqvarnagroup.com/br/teste/?article=965083236',
        detailResolved: true,
        iplSectionCount: 2,
        structuredPartCount: 27,
      }],
    });
  };

  try {
    const first = await resolvePortalCoverageOutcome(model, loader);
    const second = await resolvePortalCoverageOutcome(model, loader);

    assert.equal(first.outcome.state, 'VERIFIED');
    assert.equal(first.cacheState, 'MISS');
    assert.equal(second.outcome.state, 'VERIFIED');
    assert.equal(second.cacheState, 'HIT');
    assert.equal(calls, 1);
  } finally {
    await OfficialSourceCacheService.invalidate(key);
  }
});

test('INCONCLUSIVE não é persistido e a próxima tentativa consulta o Portal novamente', async () => {
  const model = 'CACHE323R';
  const key = buildPortalCoverageCacheKey(model);
  await OfficialSourceCacheService.invalidate(key);

  let calls = 0;
  const loader = async (): Promise<PortalModelAudit> => {
    calls += 1;
    return audit({
      model,
      searchResultCount: 0,
      exactProductCount: 0,
      portalAvailableWhenSearchEmpty: false,
      products: [],
    });
  };

  try {
    const first = await resolvePortalCoverageOutcome(model, loader);
    const second = await resolvePortalCoverageOutcome(model, loader);

    assert.equal(first.outcome.state, 'INCONCLUSIVE');
    assert.equal(second.outcome.state, 'INCONCLUSIVE');
    assert.equal(first.cacheState, 'MISS');
    assert.equal(second.cacheState, 'MISS');
    assert.equal(calls, 2);
  } finally {
    await OfficialSourceCacheService.invalidate(key);
  }
});
