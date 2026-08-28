import { normalizeIdentifier, normalizeText } from '../utils/normalize';
import type { CandidateForAi, SearchIntent } from './chat-intent.service';

const STOP_WORDS = new Set([
  'a', 'ao', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'equipamento',
  'maquina', 'modelo', 'o', 'os', 'para', 'peca', 'por', 'preciso', 'qual', 'quero', 'uma',
]);

function isPncContext(question: string, index: number) {
  return /pnc\s*$/i.test(question.slice(Math.max(0, index - 8), index));
}

export function extractLikelyPartNumber(question: string): string {
  const candidates: Array<{ value: string; index: number }> = [];
  const grouped = /\b(?:[A-Z0-9]*\d[A-Z0-9]*)(?:[\s./-]+(?:[A-Z0-9]*\d[A-Z0-9]*)){1,}\b/gi;
  const compact = /\b(?:[A-Z]{1,3})?\d{6,}\b/gi;

  for (const pattern of [grouped, compact]) {
    for (const match of question.matchAll(pattern)) {
      if (match.index === undefined || isPncContext(question, match.index)) continue;
      const value = match[0].trim();
      const normalized = normalizeIdentifier(value);
      const digits = normalized.replace(/\D/g, '').length;
      if (normalized.length >= 6 && digits >= 5) candidates.push({ value, index: match.index });
    }
  }

  return candidates.sort((a, b) => normalizeIdentifier(b.value).length - normalizeIdentifier(a.value).length)[0]?.value || '';
}

export function buildFallbackIntent(question: string): SearchIntent {
  return {
    manufacturer: '',
    model: '',
    pnc: '',
    partDescription: question.trim(),
    partNumber: extractLikelyPartNumber(question),
    section: '',
    position: '',
  };
}

export function lexicalSearchTerms(value: string): string[] {
  const terms = normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(term => term.length >= 3 && !STOP_WORDS.has(term));
  return [...new Set(terms)].slice(0, 5);
}

export function chooseCandidateLocally(
  question: string,
  candidates: CandidateForAi[],
): { id: string | null; confidence: number; ambiguous: boolean } {
  if (candidates.length === 1) return { id: candidates[0].id, confidence: 0.9, ambiguous: false };

  const terms = lexicalSearchTerms(question);
  if (!terms.length) return { id: null, confidence: 0, ambiguous: true };

  const ranked = candidates.map(candidate => {
    const searchable = normalizeText([
      candidate.name,
      candidate.section,
      candidate.position,
      ...candidate.aliases,
    ].filter(Boolean).join(' '));
    const hits = terms.filter(term => searchable.includes(term)).length;
    const exactName = normalizeText(candidate.name);
    const phraseBonus = exactName && normalizeText(question).includes(exactName) ? 0.35 : 0;
    return { id: candidate.id, score: Math.min(1, hits / terms.length + phraseBonus) };
  }).sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];
  const safeLead = best && best.score >= 0.6 && (!second || best.score - second.score >= 0.2);
  return safeLead
    ? { id: best.id, confidence: Math.max(0.72, Math.min(0.9, best.score)), ambiguous: false }
    : { id: null, confidence: best?.score || 0, ambiguous: true };
}

export function calibrateMatchConfidence(selectionConfidence: number, distance: number, exactCode = false): number {
  if (exactCode) return 1;
  const semanticConfidence = Math.max(0, Math.min(1, 1 - distance));
  return Math.max(0, Math.min(1, Math.min(selectionConfidence, semanticConfidence)));
}
