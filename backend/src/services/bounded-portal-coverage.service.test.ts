import assert from 'node:assert/strict';
import test from 'node:test';
import { portalAuditToCoverageOutcome } from './bounded-portal-coverage.service';
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
});

test('diferencia busca válida sem match exato de indisponibilidade', () => {
  const emptySearch = portalAuditToCoverageOutcome(audit({
    searchResultCount: 0,
    exactProductCount: 0,
    portalAvailableWhenSearchEmpty: true,
  }));
  assert.equal(emptySearch.state, 'NO_EXACT_MATCH');

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
});
