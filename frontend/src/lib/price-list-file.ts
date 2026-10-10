/**
 * Lê a lista de preços da Husqvarna (.html, ~35 MB) NO NAVEGADOR do administrador e monta só o que o servidor precisa.
 *
 * Quase todo o arquivo é imagem em base64; as quatro listas que valem (`pecas`, `acessorios`, `lubrificantes`, `ferramentas`) são uma fração. Enviar o
 * arquivo inteiro estouraria o limite do proxy e a memória do servidor gratuito, então o navegador extrai o bloco `catalogData`, fica com as quatro listas
 * e só os campos que o leitor do servidor usa, e comprime. A conta de preço (÷ 0,92), a recusa de código com dois preços e a comparação com o banco
 * continuam TODAS no servidor, no mesmo código do importador de linha de comando.
 */

export const PRICE_LIST_SECTIONS = ['pecas', 'acessorios', 'lubrificantes', 'ferramentas'] as const;

const FIELDS = ['codigo', 'descricao', 'preco', 'classif_fiscal', 'ean', 'modelo', 'aplicacao', 'categoria', 'tipo', 'tecnologia'] as const;

export type PriceListPayload = Record<(typeof PRICE_LIST_SECTIONS)[number], Array<Record<string, string>>> & {
  /** Peças de revisão por máquina: só as linhas de `pecas` cujo `reparo` é preventivo, consumível ou preditivo (o corretivo, ~19 mil linhas, não entra). */
  revisao: Array<Record<string, string>>;
};

export class PriceListFileError extends Error {}

/** `reparo` que conta como revisão (sem acento e em maiúscula, como o servidor lê). */
const SERVICE_KIND = /^(PREVENTIVO|CONSUMIVEL|PREDITIVO)$/;
const isServiceKind = (value: unknown) => typeof value === 'string' && SERVICE_KIND.test(value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase());

const SCRIPT_OPEN = '<script id="catalogData"';
const SCRIPT_CLOSE = '</script>';

/** Extrai as quatro listas do texto do .html. Lança `PriceListFileError` com mensagem para o balcão quando o arquivo não é a lista. */
export function extractPriceListPayload(html: string): PriceListPayload {
  const open = html.indexOf(SCRIPT_OPEN);
  if (open < 0) throw new PriceListFileError('Este não parece ser o arquivo da lista de preços (o bloco de dados não foi encontrado).');
  const start = html.indexOf('>', open) + 1;
  const end = html.indexOf(SCRIPT_CLOSE, start);
  if (start <= 0 || end < 0) throw new PriceListFileError('O arquivo da lista está incompleto. Baixe de novo e tente outra vez.');

  let catalog: unknown;
  try {
    catalog = JSON.parse(html.slice(start, end));
  } catch {
    throw new PriceListFileError('O arquivo da lista está incompleto ou corrompido. Baixe de novo e tente outra vez.');
  }
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw new PriceListFileError('O arquivo não tem o formato da lista de preços.');

  const payload = { revisao: [] } as unknown as PriceListPayload;
  for (const section of PRICE_LIST_SECTIONS) {
    const list = (catalog as Record<string, unknown>)[section];
    if (!Array.isArray(list)) throw new PriceListFileError(`A lista "${section}" não está no arquivo. Confira se é a lista de preços completa.`);
    if (section === 'pecas') {
      for (const raw of list as Array<Record<string, unknown> | null>) {
        if (!raw || !isServiceKind(raw.reparo)) continue;
        const row: Record<string, string> = {};
        for (const field of ['codigo', 'pnc', 'reparo', 'descricao']) if (typeof raw[field] === 'string') row[field] = raw[field] as string;
        payload.revisao.push(row);
      }
    }
    payload[section] = list.map(raw => {
      const row: Record<string, string> = {};
      const source = (raw ?? {}) as Record<string, unknown>;
      for (const field of FIELDS) if (typeof source[field] === 'string') row[field] = source[field] as string;
      return row;
    });
  }
  return payload;
}

/** `gzip(JSON)` como o servidor espera. Usa o `CompressionStream` do navegador (sem dependência nova). */
export async function gzipJson(value: unknown): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') {
    throw new PriceListFileError('Este navegador não consegue preparar o arquivo. Use uma versão atual do Chrome ou do Edge.');
  }
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}
