import assert from 'node:assert/strict';
import test from 'node:test';
import { hasLegacyOccurrenceConflictWarning } from './catalog-health-maintenance';

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
