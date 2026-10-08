// Nome de exibição do usuário (o que sai em "ATT." nos orçamentos do cliente). Antes ele era DEDUZIDO do e-mail e saía
// "Matheusf Ls" para matheusfran.ls@..., errado na frente do cliente. Agora é um campo próprio, definido pelo administrador.
//
// Só letras (com acento), espaço, ponto, apóstrofo e hífen: nome de pessoa, nunca e-mail, número ou texto qualquer.
const NAME_PATTERN = /^[\p{L}][\p{L}\p{M} .'’-]*$/u;
export const MIN_DISPLAY_NAME_LENGTH = 2;
export const MAX_DISPLAY_NAME_LENGTH = 80;

export type ParsedDisplayName = { ok: true; value: string | null } | { ok: false };

/** `null`/vazio limpa o nome; texto válido vira o nome normalizado; o resto é recusado. `undefined` o chamador trata (não enviado). */
export function parseDisplayName(value: unknown): ParsedDisplayName {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const name = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!name) return { ok: true, value: null };
  if (name.length < MIN_DISPLAY_NAME_LENGTH || name.length > MAX_DISPLAY_NAME_LENGTH) return { ok: false };
  return NAME_PATTERN.test(name) ? { ok: true, value: name } : { ok: false };
}
