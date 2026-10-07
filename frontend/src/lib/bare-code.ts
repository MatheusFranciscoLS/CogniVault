/**
 * O texto digitado é SÓ um código de peça Husqvarna (6 a 14 dígitos, com espaço, ponto ou traço da etiqueta)?
 *
 * Só nesse caso a busca consulta o Portal para saber se o código foi substituído. Frase com palavra
 * ("carburador 587106701") fica de fora: o código ali é contexto, e consultar o Portal a cada frase gastaria à toa.
 * Devolve os dígitos sem máscara, que é como o Portal e o cadastro guardam o código; senão, `null`.
 */
export function bareHusqvarnaCode(text: string): string | null {
  const trimmed = text.trim();
  if (!/^\d[\d .-]*\d$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 14 ? digits : null;
}
