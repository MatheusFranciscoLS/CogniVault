export type PortalVerificationCandidate = {
  model: string;
  normalizedModel: string;
  status: 'LOCAL_IPL' | 'PORTAL_IPL' | 'PORTAL_DOCUMENT' | 'NOT_APPLICABLE' | 'PAUSED' | 'UNVERIFIED';
  commercialSignals: number;
  commercialEvidence?: string[];
  /** Quando já há resposta guardada do Portal, o modelo não precisa ser consultado de novo. */
  portalVerification?: 'NOT_CHECKED' | 'VERIFIED' | 'DOCUMENT_ONLY' | 'NO_EXACT_MATCH' | 'NO_IPL' | 'INCONCLUSIVE';
};

const CONCLUDED = new Set(['VERIFIED', 'DOCUMENT_ONLY', 'NO_EXACT_MATCH', 'NO_IPL']);

/**
 * Seleciona apenas lacunas técnicas ainda não verificadas para uma homologação
 * explícita no Portal Husqvarna Brasil. A lista comercial define prioridade,
 * nunca compatibilidade. O limite evita varreduras acidentais do portfólio todo.
 */
export function selectPortalVerificationCandidates<T extends PortalVerificationCandidate>(
  items: T[],
  limit = 8,
  exclude: ReadonlySet<string> = new Set(),
): T[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0;
  if (!safeLimit) return [];

  return items
    .filter(item => item.status === 'UNVERIFIED')
    .filter(item => !CONCLUDED.has(item.portalVerification ?? ''))
    .filter(item => !exclude.has(item.normalizedModel))
    .sort((a, b) => b.commercialSignals - a.commercialSignals || a.normalizedModel.localeCompare(b.normalizedModel))
    .slice(0, safeLimit);
}
