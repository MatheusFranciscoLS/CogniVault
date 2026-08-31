import assert from 'node:assert/strict';
import test from 'node:test';
import { hasLegacyOccurrenceConflictWarning, needsCatalogExtractorRepair } from './catalog-health-maintenance';

test('identifies the obsolete exploded-view conflict diagnosis', () => {
  assert.equal(hasLegacyOccurrenceConflictWarning([
    '3 posição(ões) de vista técnica comprovada possuem mais de um código ativo sem regra de PNC, série ou mercado que os diferencie.',
  ]), true);
});

test('does not recalculate catalogs that already use the alternative-code warning', () => {
  assert.equal(hasLegacyOccurrenceConflictWarning([
    '3 posição(ões) possuem códigos alternativos publicados na mesma vista, sem discriminador explícito no PDF.',
  ]), false);
  assert.equal(hasLegacyOccurrenceConflictWarning(null), false);
});

test('queues re-extraction only for parser defects that require replacing persisted rows', () => {
  assert.equal(needsCatalogExtractorRepair([
    '12 ocorrência(s) possuem PNC persistido incompatível com a própria regra “For/EXCEPT” do catálogo.',
  ]), true);
  assert.equal(needsCatalogExtractorRepair([
    '16 PNC(s) do equipamento parecem ter sido lidos como código de peça.',
  ]), true);
  assert.equal(needsCatalogExtractorRepair([
    '3 posição(ões) possuem códigos alternativos publicados na mesma vista.',
  ]), false);
});
