import { normalizeText } from '../utils/normalize';
import { buildSearchGroups } from './part-vocabulary';

export interface FeedbackLearningCandidate {
  id: string;
  normalizedModel: string;
  normalizedPnc: string | null;
  universalAcrossPnc: boolean;
  feedbackScore: number;
}

export interface FeedbackLearningSignal {
  resultPartId: string;
  correctedPartId: string | null;
  correct: boolean;
  normalizedQuery: string;
  normalizedModel: string | null;
  normalizedPnc: string | null;
  userId?: string | null;
  createdAt?: Date | string;
}

function groupKeys(value: string): Set<string> {
  return new Set(buildSearchGroups(value).map(group => group.key));
}

function overlapRatio(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let matches = 0;
  for (const value of left) if (right.has(value)) matches += 1;
  return matches / Math.max(left.size, right.size);
}

/**
 * Compara duas consultas sem depender de IA externa. Consultas idênticas têm
 * peso máximo; sinônimos do vocabulário técnico (carburador/carburettor, por
 * exemplo) também são reconhecidos como o mesmo assunto.
 */
export function feedbackQuerySimilarity(currentQuery: string, previousQuery: string): number {
  const current = normalizeText(currentQuery);
  const previous = normalizeText(previousQuery);
  if (!current || !previous) return 0;
  if (current === previous) return 1;

  const currentGroups = groupKeys(current);
  const previousGroups = groupKeys(previous);
  const groupSimilarity = overlapRatio(currentGroups, previousGroups);
  if (groupSimilarity > 0) return Math.min(0.94, 0.72 + groupSimilarity * 0.22);

  const currentTokens = new Set(current.split(/[^a-z0-9]+/).filter(token => token.length >= 4));
  const previousTokens = new Set(previous.split(/[^a-z0-9]+/).filter(token => token.length >= 4));
  return overlapRatio(currentTokens, previousTokens) * 0.7;
}

/**
 * Aplica um sinal pequeno e limitado ao ranking técnico. Feedback nunca cria
 * códigos nem supera sozinho uma incompatibilidade de modelo/PNC.
 */
export function applyFeedbackLearning(
  currentQuery: string,
  candidates: FeedbackLearningCandidate[],
  signals: FeedbackLearningSignal[],
): number {
  let applied = 0;

  // Um usuário pode clicar/repetir a mesma consulta várias vezes. Para que isso
  // não vire um “atalho” artificial, cada pessoa conta uma vez por sinal técnico.
  const grouped = new Map<string, { signal: FeedbackLearningSignal; voters: Set<string>; newestAt: number }>();
  signals.forEach((signal, index) => {
    const key = [
      signal.normalizedQuery,
      signal.normalizedModel || '',
      signal.normalizedPnc || '',
      signal.resultPartId,
      signal.correct ? '1' : '0',
      signal.correctedPartId || '',
    ].join('|');
    const createdAt = signal.createdAt ? new Date(signal.createdAt).getTime() : Date.now();
    const current = grouped.get(key) || { signal, voters: new Set<string>(), newestAt: createdAt };
    current.voters.add(signal.userId || `legacy:${index}`);
    if (createdAt >= current.newestAt) {
      current.signal = signal;
      current.newestAt = createdAt;
    }
    grouped.set(key, current);
  });

  for (const { signal, voters, newestAt } of grouped.values()) {
    const similarity = feedbackQuerySimilarity(currentQuery, signal.normalizedQuery);
    if (similarity < 0.55) continue;

    const support = voters.size;
    const ageDays = Math.max(0, (Date.now() - newestAt) / (24 * 60 * 60 * 1000));
    const recencyWeight = Math.max(0.55, 1 - ageDays / 730);
    const positiveStrength = support >= 3 ? 0.06 : support === 2 ? 0.04 : 0.02;
    const negativeStrength = signal.correctedPartId
      ? (support >= 2 ? 0.08 : 0.055)
      : (support >= 2 ? 0.04 : 0.015);
    const correctionStrength = support >= 2 ? 0.11 : 0.075;

    for (const candidate of candidates) {
      if (signal.normalizedModel && signal.normalizedModel !== candidate.normalizedModel) continue;
      if (signal.normalizedPnc && !candidate.universalAcrossPnc && signal.normalizedPnc !== candidate.normalizedPnc) continue;

      const contextWeight = (signal.normalizedModel ? 1 : 0.82) * (signal.normalizedPnc ? 1 : 0.88);
      const weight = similarity * contextWeight * recencyWeight;
      if (candidate.id === signal.resultPartId) {
        candidate.feedbackScore += (signal.correct ? positiveStrength : -negativeStrength) * weight;
        applied += 1;
      }
      if (!signal.correct && signal.correctedPartId === candidate.id) {
        candidate.feedbackScore += correctionStrength * weight;
        applied += 1;
      }
    }
  }

  for (const candidate of candidates) {
    candidate.feedbackScore = Math.max(-0.16, Math.min(0.16, candidate.feedbackScore));
  }
  return applied;
}
