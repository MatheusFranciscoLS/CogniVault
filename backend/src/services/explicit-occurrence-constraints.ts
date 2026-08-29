import { normalizeIdentifier } from '../utils/normalize';
import { findPartConcepts } from './part-vocabulary';

export type ExplicitOccurrenceCandidate = {
  section?: string | null;
  position?: string | null;
};

/**
 * Só considera posição quando o usuário a identifica explicitamente como posição,
 * item ou referência da vista. Números soltos continuam livres para modelo/PNC/SN.
 */
export function extractExplicitOccurrencePosition(question: string): string {
  const normalized = question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const match = normalized.match(/\b(?:posicao|pos\.?|item|ref\.?|referencia)\s*[:#.-]?\s*(\d{1,3})\b/i);
  return match?.[1] || '';
}

/**
 * Extrai seção somente quando existe um marcador explícito (vista, seção,
 * diagrama ou grupo). Isso evita transformar automaticamente relações como
 * "parafuso da embreagem" em uma seção rígida.
 */
export function extractExplicitOccurrenceSection(question: string): string {
  const match = question.match(/\b(?:vista|se[cç][aã]o|secao|diagrama|grupo)\s*(?:t[eé]cnic[ao]\s*)?(?:de|da|do)?\s*[:#-]?\s*([^,;?.]+)/i);
  if (!match?.[1]) return '';

  let section = match[1]
    .replace(/\b(?:posição|posicao|pos\.?|item|ref\.?|referência|referencia)\s*[:#.-]?\s*\d{1,3}\b.*$/i, ' ')
    .trim();

  // Remove apenas um sufixo que comece como identificação de máquina. O token
  // principal precisa conter dígito; um prefixo curto cobre formatos como
  // "LC 353AWD" sem consumir nomes mecânicos como "freio da corrente".
  section = section.replace(
    /\s+(?:da|do|de)\s+(?:husqvarna\s+)?(?:[a-z]{1,4}\s+)?(?=[a-z0-9-]*\d)[a-z0-9-]+(?:\s+[a-z0-9-]+){0,2}$/i,
    ' ',
  ).trim();
  section = section.replace(/\s+/g, ' ').replace(/^(?:de|da|do)\s+/i, '').trim();

  if (!section || section.length > 80) return '';
  return section;
}

function sectionMatches(requestedSection: string, candidateSection: string | null | undefined): boolean {
  if (!requestedSection || !candidateSection) return false;
  const requested = normalizeIdentifier(requestedSection);
  const candidate = normalizeIdentifier(candidateSection);
  if (!requested || !candidate) return false;
  if (candidate.includes(requested) || requested.includes(candidate)) return true;

  const requestedConcepts = new Set(findPartConcepts(requestedSection).map(item => item.key));
  if (!requestedConcepts.size) return false;
  return findPartConcepts(candidateSection).some(item => requestedConcepts.has(item.key));
}

/**
 * Reduz candidatos apenas quando os próprios dados extraídos comprovam a
 * restrição informada. Se a extração não tiver seção/posição suficiente, mantém
 * o conjunto original (fail-open) para não esconder uma peça válida.
 *
 * Quando seção e posição existem mas apontam para conjuntos incompatíveis,
 * também mantém os candidatos: isso é evidência conflitante e deve chegar ao
 * gate de ambiguidade, não ser resolvido à força.
 */
export function applyExplicitOccurrenceConstraints<T extends ExplicitOccurrenceCandidate>(
  question: string,
  candidates: T[],
): T[] {
  if (candidates.length <= 1) return candidates;

  const requestedPosition = normalizeIdentifier(extractExplicitOccurrencePosition(question));
  const requestedSection = extractExplicitOccurrenceSection(question);
  if (!requestedPosition && !requestedSection) return candidates;

  const positionMatches = requestedPosition
    ? candidates.filter(candidate => normalizeIdentifier(candidate.position) === requestedPosition)
    : [];
  const sectionMatchesRows = requestedSection
    ? candidates.filter(candidate => sectionMatches(requestedSection, candidate.section))
    : [];

  if (requestedPosition && requestedSection) {
    const intersection = candidates.filter(candidate =>
      normalizeIdentifier(candidate.position) === requestedPosition
      && sectionMatches(requestedSection, candidate.section),
    );
    if (intersection.length) return intersection;

    // As duas restrições encontram evidência, mas em candidatos diferentes.
    // Não escolha qual delas "vence": deixe o gate técnico tratar o conflito.
    if (positionMatches.length && sectionMatchesRows.length) return candidates;
    if (positionMatches.length) return positionMatches;
    if (sectionMatchesRows.length) return sectionMatchesRows;
    return candidates;
  }

  if (requestedPosition && positionMatches.length) return positionMatches;
  if (requestedSection && sectionMatchesRows.length) return sectionMatchesRows;
  return candidates;
}
