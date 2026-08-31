export function isVisualQuotaFailure(error: string | null | undefined): boolean {
  if (!error) return false;
  return /(?:cota|quota).*(?:ia|gemini)|(?:ia|gemini).*(?:cota|quota)/i.test(error)
    && /(?:visual|pdf|leitura|modelo)/i.test(error);
}
