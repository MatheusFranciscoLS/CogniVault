// Leitor da lista de preços da Husqvarna distribuída em .html.
//
// O arquivo é uma página de consulta com os dados num <script
// id="catalogData" type="application/json"> (~35 MB, quase tudo imagem em base64).
// As quatro listas que interessam ao balcão são `pecas`, `acessorios`,
// `lubrificantes` e `ferramentas`; `produtos` (máquinas) fica de fora de propósito:
// a loja não vende máquina por este cadastro.
//
// Função pura: recebe o texto e devolve o que leu e o que recusou. Quem decide o
// que gravar é o importador. Recusar é decisão de projeto: preço fora do padrão ou
// código com dois preços diferentes não entra, em vez de virar chute.
import { normalizeIdentifier } from '../utils/normalize';

export const PRICE_LIST_SECTIONS = ['pecas', 'acessorios', 'lubrificantes', 'ferramentas'] as const;
export type PriceListSection = (typeof PRICE_LIST_SECTIONS)[number];

/** Onde o código é usado, como o arquivo diz: modelo da máquina e categoria. */
export type HtmlApplication = {
  application: string | null;
  productCategory: string | null;
  technology: string | null;
};

export type HtmlPriceItem = {
  partNumber: string;
  normalizedNumber: string;
  name: string;
  /** PREÇO CONSUMIDOR da Husqvarna, como veio. A regra ÷ 0,92 é do importador. */
  consumerPrice: number;
  ncm: string | null;
  ean: string | null;
  section: PriceListSection;
  applications: HtmlApplication[];
};

export type RejectedCode = { normalizedNumber: string; reason: 'PRECO_CONFLITANTE'; prices: number[] };

export type HtmlPriceList = {
  items: HtmlPriceItem[];
  rejected: RejectedCode[];
  stats: {
    rows: number;
    rowsWithoutCode: number;
    rowsWithBadPrice: number;
    uniqueCodes: number;
  };
};

const SCRIPT_OPEN = '<script id="catalogData"';
const SCRIPT_CLOSE = '</script>';

// "R$ 22,00" ou "R$ 9.171,00". Nada além disso: "22.5", "R$ 1,5" e texto livre
// recusam. Ler errado um preço é pior do que não atualizá-lo.
const BRL = /^R\$\s?(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/;

export function parseBrlPrice(input: unknown): number | null {
  if (typeof input !== 'string') return null;
  const match = BRL.exec(input.trim());
  if (!match) return null;
  const value = Number(`${match[1].replace(/\./g, '')}.${match[2]}`);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function cleanText(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const result = input.replace(/\s+/g, ' ').trim();
  return result && result !== '-' ? result : null;
}

export function extractCatalogJson(html: string): Record<string, unknown> {
  const open = html.indexOf(SCRIPT_OPEN);
  if (open < 0) throw new Error('Bloco catalogData não encontrado: este não parece o arquivo da lista de preços.');
  const start = html.indexOf('>', open) + 1;
  const end = html.indexOf(SCRIPT_CLOSE, start);
  if (start <= 0 || end < 0) throw new Error('Bloco catalogData está incompleto.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(html.slice(start, end));
  } catch {
    throw new Error('Bloco catalogData não é JSON válido.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Bloco catalogData não tem o formato esperado.');
  }
  return parsed as Record<string, unknown>;
}

export function parsePriceListHtml(html: string): HtmlPriceList {
  const catalog = extractCatalogJson(html);
  const byCode = new Map<string, HtmlPriceItem>();
  const conflicts = new Map<string, Set<number>>();
  const stats = { rows: 0, rowsWithoutCode: 0, rowsWithBadPrice: 0, uniqueCodes: 0 };

  for (const section of PRICE_LIST_SECTIONS) {
    const list = catalog[section];
    if (!Array.isArray(list)) throw new Error(`Lista "${section}" não encontrada no arquivo.`);

    for (const row of list as Record<string, unknown>[]) {
      stats.rows += 1;
      const partNumber = cleanText(row?.codigo);
      const normalizedNumber = normalizeIdentifier(partNumber);
      if (!partNumber || !normalizedNumber) {
        stats.rowsWithoutCode += 1;
        continue;
      }

      const consumerPrice = parseBrlPrice(row.preco);
      if (consumerPrice === null) {
        stats.rowsWithBadPrice += 1;
        continue;
      }

      const application: HtmlApplication = {
        application: cleanText(row.modelo),
        productCategory: cleanText(row.categoria) ?? cleanText(row.tipo),
        technology: cleanText(row.tecnologia),
      };

      const known = byCode.get(normalizedNumber);
      if (known) {
        const seen = known.applications.some(
          item =>
            item.application === application.application &&
            item.productCategory === application.productCategory &&
            item.technology === application.technology,
        );
        if (!seen) known.applications.push(application);

        // Mesmo código em vários modelos/PNCs: o preço é do código, então tem que ser igual.
        if (known.consumerPrice !== consumerPrice) {
          const prices = conflicts.get(normalizedNumber) ?? new Set([known.consumerPrice]);
          prices.add(consumerPrice);
          conflicts.set(normalizedNumber, prices);
        }
        continue;
      }

      byCode.set(normalizedNumber, {
        partNumber,
        normalizedNumber,
        name: cleanText(row.descricao) ?? partNumber,
        consumerPrice,
        ncm: cleanText(row.classif_fiscal),
        ean: cleanText(row.ean),
        section,
        applications: [application],
      });
    }
  }

  const rejected: RejectedCode[] = [];
  for (const [normalizedNumber, prices] of conflicts) {
    byCode.delete(normalizedNumber);
    rejected.push({ normalizedNumber, reason: 'PRECO_CONFLITANTE', prices: [...prices].sort((a, b) => a - b) });
  }

  stats.uniqueCodes = byCode.size;
  return { items: [...byCode.values()], rejected, stats };
}
