export const MIN_FULL_TEXT_RESULTS_TO_SKIP_FUZZY = 12;

/**
 * pg_trgm fuzzy retrieval is deliberately a fallback. Indexed full-text search
 * is substantially cheaper and should satisfy the normal, correctly-spelled path.
 * Keep fuzzy enabled when full-text evidence is sparse so typo tolerance remains.
 */
export function shouldRunFuzzyPartRetrieval(fullTextResultCount: number): boolean {
  return !Number.isFinite(fullTextResultCount)
    || fullTextResultCount < MIN_FULL_TEXT_RESULTS_TO_SKIP_FUZZY;
}
