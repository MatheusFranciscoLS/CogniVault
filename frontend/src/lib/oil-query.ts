/**
 * Óleo é consumível, não peça de catálogo: a loja não cadastra código de óleo, então ele entra no orçamento como
 * linha avulsa (`SRV-`). Estes são os quatro que a loja vende (ver `backend/src/services/machine-oil.ts`, que tem a
 * regra do dono sobre qual serve a cada máquina). Quando a pergunta é só "óleo", não há máquina para decidir, e o
 * desenho que o dono pediu é mostrar as opções e deixar o atendente escolher: recomendar 20W50 para um motor 2
 * tempos estraga o motor do cliente.
 */
export type OilOption = { code: string; label: string };

export const OIL_OPTIONS: OilOption[] = [
  { code: 'SRV-OLEO-2T', label: 'Óleo 2 tempos' },
  { code: 'SRV-OLEO-CORRENTE', label: 'Óleo de corrente' },
  { code: 'SRV-OLEO-20W50', label: 'Óleo 20W50' },
  { code: 'SRV-OLEO-15W50', label: 'Óleo 15W50' },
];

/** Palavras que dizem que a pergunta é por uma PEÇA ligada a óleo ("filtro de óleo"), e não pelo óleo em si. */
const OIL_RELATED_PARTS = /\b(filtro|bujao|tampa|bomba|vareta|retentor|mangueira|reservatorio|tanque|junta|anel|cartucho|carter|medidor|visor|pescador|dosador|bico|valvula|tubo)\b/;

/** A busca é pelo óleo (consumível)? "oleo 2 tempos", "óleo de corrente", "20w50"; não "filtro de óleo". */
export function looksLikeOilQuery(query: string): boolean {
  const text = query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (OIL_RELATED_PARTS.test(text)) return false;
  return /\boleo\b/.test(text) || /\b(15w-?50|20w-?50|15w-?40|10w-?30)\b/.test(text);
}
