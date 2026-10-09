// Como o Registro de ações escreve cada evento para o dono. Um código cru ("QUOTE_SAVED", "USER") não diz nada a quem lê.
const ACTIONS: Record<string, string> = {
  DOCUMENT_UPLOADED: 'Catálogo enviado',
  DOCUMENT_ARCHIVED: 'Catálogo arquivado',
  DOCUMENT_RESTORED: 'Catálogo restaurado',
  DOCUMENT_REPROCESSED: 'Catálogo reprocessado',
  DOCUMENT_CATEGORY_CHANGED: 'Seção do catálogo alterada',
  DOCUMENT_METADATA_REVIEWED: 'Dados do catálogo conferidos',
  DOCUMENT_PDF_REMOVED: 'PDF do catálogo removido',
  DOCUMENT_QUALITY_CONFIRMED: 'Qualidade do catálogo confirmada',
  USER_CREATED: 'Usuário criado',
  USER_UPDATED: 'Usuário alterado',
  USER_LOGIN: 'Login efetuado',
  QUOTE_SAVED: 'Orçamento salvo',
  QUOTE_UPDATED: 'Orçamento alterado',
  QUOTE_DELETED: 'Orçamento excluído',
  EXPORT_QUOTES: 'Orçamentos exportados',
  EXPORT_PRICE_LIST: 'Lista de preços exportada',
  PRICE_LIST_UPDATE: 'Lista de preços atualizada',
  PRICE_LIST_UNDO: 'Atualização da lista desfeita',
  REPAIR_IMPORT: 'Orçamentos de conserto antigos importados',
  PART_LOCATION_UPDATED: 'Prateleira da peça alterada',
  OFFICIAL_PART_VERIFICATION_SUBMITTED: 'Conferência de código enviada',
  SEARCH_RADAR_CLEARED: 'Radar de buscas limpo',
  SEARCH_RADAR_ITEM_DISMISSED: 'Item do radar dispensado',
  SEMANTIC_INDEX_BATCH: 'Índice de busca atualizado',
  AI_BENCHMARK_RUN: 'Benchmark executado',
  AI_TECHNICAL_KNOWLEDGE_REBUILT: 'Diagnóstico técnico atualizado',
  AI_VISUAL_CATALOG_RETRY_REQUESTED: 'Nova leitura visual do catálogo pedida',
};

const TARGETS: Record<string, string> = {
  USER: 'Usuário',
  Quote: 'Orçamento',
  DOCUMENT: 'Catálogo',
  MasterPart: 'Cadastro de preços',
  PART_NUMBER: 'Peça',
  OfficialPartVerification: 'Conferência de código',
  SEARCH_RADAR: 'Radar de buscas',
  AI_BENCHMARK: 'Benchmark',
  AI_USAGE: 'Uso de IA',
  TENANT: 'Loja',
};

/** "QUOTE_SAVED" → "Orçamento salvo". Código novo, ainda sem tradução, aparece legível em vez de cru ("Quote saved"). */
export function actionLabel(action: string): string {
  if (ACTIONS[action]) return ACTIONS[action];
  const words = action.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function targetLabel(targetType: string): string {
  return TARGETS[targetType] ?? targetType;
}

/** Login é a maior parte do registro e quase nunca é o que o dono procura. */
export function isLoginAction(action: string): boolean {
  return action === 'USER_LOGIN';
}
