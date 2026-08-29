import { relationSpecificityBonus } from './candidate-specificity';
import { fullTextPartCandidates, fuzzyPartCandidates, type HybridTextCandidateRow } from './hybrid-part-retrieval';
import {
  PartSearchService as BasePartSearchService,
  deduplicatePartCandidates,
  type PartCandidate,
} from './part-search.service';
import { preferCurrentPartNumbers } from './part-supersession';
import { normalizedReciprocalRankFusionScores } from './retrieval-fusion';
import type { SearchIntent } from './chat-intent.service';
import { normalizeIdentifier } from '../utils/normalize';

export type RetrievalSource = 'DIRECT_CODE' | 'LEXICAL' | 'SEMANTIC' | 'FULL_TEXT' | 'FUZZY';
export type ReliablePartCandidate = PartCandidate & {
  retrievalSources?: RetrievalSource[];
  retrievalAgreement?: number;
};

function rowToCandidate(row: HybridTextCandidateRow): ReliablePartCandidate {
  const score = Math.max(0, Math.min(1, Number(row.score) || 0));
  const distance = row.source === 'FULL_TEXT'
    ? Math.max(0.16, 0.58 - score * 0.35)
    : Math.max(0.22, 0.72 - score * 0.46);
  return {
    id: row.id,
    documentId: row.documentId,
    filename: row.filename,
    manufacturer: row.manufacturer,
    model: row.model,
    normalizedModel: row.normalizedModel,
    pnc: row.pnc || row.documentPnc,
    normalizedPnc: row.normalizedPnc || normalizeIdentifier(row.documentPnc) || null,
    universalAcrossPnc: row.documentPnc ? false : row.universalAcrossPnc,
    section: row.section,
    position: row.position,
    name: row.name,
    alternativeNames: row.alternativeNames,
    partNumber: row.partNumber,
    normalizedPartNumber: row.normalizedPartNumber,
    page: row.page,
    notes: row.notes,
    distance,
    feedbackScore: 0,
    searchMethod: 'LEXICAL',
    retrievalSources: [row.source],
  };
}

function sourcesOf(candidate: ReliablePartCandidate): RetrievalSource[] {
  if (candidate.retrievalSources?.length) return candidate.retrievalSources;
  return [candidate.searchMethod];
}

function mergeById(candidates: ReliablePartCandidate[], fusion: Map<string, number>): ReliablePartCandidate[] {
  const byId = new Map<string, ReliablePartCandidate>();
  for (const candidate of candidates) {
    const current = byId.get(candidate.id);
    if (!current) {
      byId.set(candidate.id, { ...candidate, retrievalSources: [...sourcesOf(candidate)] });
      continue;
    }
    const sources = [...new Set([...sourcesOf(current), ...sourcesOf(candidate)])];
    const preferCandidate = (candidate.feedbackScore || 0) > (current.feedbackScore || 0)
      || candidate.distance < current.distance;
    const preferred = preferCandidate ? candidate : current;
    byId.set(candidate.id, { ...preferred, retrievalSources: sources });
  }
  return [...byId.values()].map(candidate => ({
    ...candidate,
    retrievalScore: fusion.get(candidate.id) || candidate.retrievalScore || 0,
    retrievalAgreement: new Set(sourcesOf(candidate)).size,
  }));
}

function reliabilityScore(question: string, candidate: ReliablePartCandidate): number {
  const retrieval = candidate.retrievalScore ?? Math.max(0, 1 - candidate.distance);
  const agreementBonus = Math.min(0.18, Math.max(0, (candidate.retrievalAgreement || 1) - 1) * 0.06);
  const specificity = relationSpecificityBonus(question, {
    name: candidate.name,
    section: candidate.section,
    aliases: candidate.alternativeNames,
    notes: candidate.notes,
  });
  return retrieval + agreementBonus + candidate.feedbackScore + specificity * 0.55;
}

/**
 * Busca de produção V2: mantém o recuperador já validado e acrescenta dois
 * recuperadores independentes do PostgreSQL. RRF combina posições, não escalas.
 * Concordância entre métodos aumenta confiança; nenhum método cria Part Number.
 */
export class ReliablePartSearchService extends BasePartSearchService {
  static async semantic(tenantId: string, question: string, intent: SearchIntent): Promise<ReliablePartCandidate[]> {
    const basePromise = BasePartSearchService.semantic(tenantId, question, intent);
    const ftsPromise = fullTextPartCandidates(tenantId, question, intent).catch(error => {
      console.warn('⚠️ Full-text search indisponível; mantendo recuperadores existentes.', error instanceof Error ? error.message : error);
      return [];
    });
    const fuzzyPromise = fuzzyPartCandidates(tenantId, question, intent).catch(error => {
      console.warn('⚠️ Busca fuzzy indisponível; mantendo recuperadores existentes.', error instanceof Error ? error.message : error);
      return [];
    });

    const [base, ftsRows, fuzzyRows] = await Promise.all([basePromise, ftsPromise, fuzzyPromise]);
    const baseCandidates: ReliablePartCandidate[] = base.map(candidate => ({
      ...candidate,
      retrievalSources: candidate.searchMethod === 'DIRECT_CODE' ? ['DIRECT_CODE'] : [candidate.searchMethod],
    }));
    const fts = ftsRows.map(rowToCandidate);
    const fuzzy = fuzzyRows.map(rowToCandidate);

    if (!fts.length && !fuzzy.length) return baseCandidates;
    const rankings = [baseCandidates, fts, fuzzy].filter(ranking => ranking.length > 0);
    const fusion = normalizedReciprocalRankFusionScores(rankings);
    const merged = mergeById([...baseCandidates, ...fts, ...fuzzy], fusion);
    const deduplicated = deduplicatePartCandidates(merged) as ReliablePartCandidate[];
    return preferCurrentPartNumbers(
      deduplicated.sort((a, b) => reliabilityScore(question, b) - reliabilityScore(question, a)),
    ).slice(0, 40) as ReliablePartCandidate[];
  }
}
