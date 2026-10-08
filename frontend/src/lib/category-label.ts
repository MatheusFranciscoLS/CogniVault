/** "MOTOSSERRA" → "Motosserra". Categoria que já tem minúscula ("Roçadeiras", "Cortador de grama") fica como veio. */
export function categoryLabel(category: string | null | undefined): string {
  const text = (category ?? '').trim();
  if (!text) return '';
  if (text !== text.toLocaleUpperCase('pt-BR')) return text;
  const lower = text.toLocaleLowerCase('pt-BR');
  return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
}
