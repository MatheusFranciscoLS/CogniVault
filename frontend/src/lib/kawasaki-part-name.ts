/**
 * A Kawasaki escreve o aviso de aplicação no mesmo campo do nome, separado por "|":
 * "999CC CYL HEAD KIT#1(EARLY) | FOR FX921V SERIAL NUMBERS THROUGH FX921VA45905...".
 * O nome é o que o balcão procura; o aviso é o que decide se a peça serve naquele motor.
 */
export function splitKawasakiPartName(raw: string): { name: string; note: string | null } {
  const text = String(raw ?? '');
  const cut = text.indexOf('|');
  if (cut < 0) return { name: text.trim(), note: null };
  const name = text.slice(0, cut).trim();
  const note = text.slice(cut + 1).trim();
  if (!name) return { name: note, note: null };
  return { name, note: note || null };
}
