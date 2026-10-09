import { describe, expect, it } from 'vitest';
import { actionLabel, targetLabel } from './audit-labels';

// Toda ação que o servidor grava no registro precisa de rótulo em português: sem ele o dono lê "Price list update". Esta lista espelha
// as ações de `backend/src` (AuditService.record); ação nova entra aqui e em `audit-labels.ts`.
const SERVER_ACTIONS = [
  'DOCUMENT_UPLOADED', 'DOCUMENT_ARCHIVED', 'DOCUMENT_RESTORED', 'DOCUMENT_REPROCESSED', 'DOCUMENT_CATEGORY_CHANGED', 'DOCUMENT_METADATA_REVIEWED',
  'DOCUMENT_PDF_REMOVED', 'DOCUMENT_QUALITY_CONFIRMED', 'USER_CREATED', 'USER_UPDATED', 'USER_LOGIN', 'QUOTE_SAVED', 'QUOTE_UPDATED', 'QUOTE_DELETED',
  'EXPORT_QUOTES', 'EXPORT_PRICE_LIST', 'PRICE_LIST_UPDATE', 'OFFICIAL_PART_VERIFICATION_SUBMITTED', 'SEARCH_RADAR_CLEARED', 'SEARCH_RADAR_ITEM_DISMISSED',
  'SEMANTIC_INDEX_BATCH', 'AI_BENCHMARK_RUN', 'AI_TECHNICAL_KNOWLEDGE_REBUILT', 'AI_VISUAL_CATALOG_RETRY_REQUESTED',
];

describe('rótulos do registro de ações', () => {
  it('toda ação do servidor tem rótulo em português (nada de "Quote saved")', () => {
    for (const action of SERVER_ACTIONS) {
      const label = actionLabel(action);
      const fallback = action.toLowerCase().split('_').join(' ');
      expect(label.toLowerCase(), action).not.toBe(fallback);
    }
  });

  it('a atualização da lista de preços aparece como o dono entende', () => {
    expect(actionLabel('PRICE_LIST_UPDATE')).toBe('Lista de preços atualizada');
    expect(targetLabel('MasterPart')).toBe('Cadastro de preços');
  });

  it('ação sem tradução continua legível', () => {
    expect(actionLabel('SOMETHING_NEW')).toBe('Something new');
  });
});
