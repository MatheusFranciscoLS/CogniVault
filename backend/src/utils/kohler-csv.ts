/**
 * Exportação em CSV do catálogo Kohler (`sparepartcatalogexport/exportcsv?EngineMatNumber=<spec>`).
 *
 * Medido em 2026-10-08: UMA chamada devolve o motor INTEIRO (todos os grupos, ~250 códigos, ~10 KB, sem login). A leitura por HTML exige uma chamada por
 * grupo (18 num motor), e é isso que aciona a trava anti-robô da Kohler depois de uns 6 grupos. O CSV não traz desenho nem substituição de código (o HTML
 * traz); traz posição, kit, "incluída em", código, nome, nota, quantidade e a marca "Tech info". Serve para indexar o motor inteiro de uma vez e como lista
 * de reserva quando o desenho de um grupo está bloqueado.
 *
 * Formato: ponto e vírgula, aspas duplas com "" para aspas, CRLF. Antes dos grupos vem um sumário ("Code;Description"); cada grupo abre com "01 - CrankShaft".
 */

export type KohlerCsvPart = {
  position: string | null;
  kit: string | null;
  includedIn: string | null;
  partNumber: string;
  name: string;
  note: string | null;
  quantity: number | null;
  techInfo: boolean;
  /** A Kohler escreve "-DISCONTINUED" ou "(#DSC)" na descrição das peças fora de linha. */
  discontinued: boolean;
};

export type KohlerCsvGroup = { code: string; name: string; parts: KohlerCsvPart[] };

export type KohlerCsvCatalog = {
  spec: string;
  lastUpdate: string | null;
  groups: KohlerCsvGroup[];
};

/** Separa uma linha em campos, respeitando aspas ("" dentro de aspas é uma aspa). */
function splitFields(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ';') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

const GROUP_HEADER = /^(\d{2}) - (.+)$/;

/** Lê o CSV. Devolve nulo quando o texto não é um catálogo de motor (sem a linha "Spare parts catalog : <spec>"). */
export function parseKohlerCsv(text: string | null | undefined): KohlerCsvCatalog | null {
  const lines = String(text ?? '').split('\n').map(line => line.replace(/\r/g, ''));
  const title = /^Spare parts catalog\s*:\s*([A-Z0-9-]+)/i.exec(lines[0] ?? '');
  if (!title) return null;

  let lastUpdate: string | null = null;
  const groups: KohlerCsvGroup[] = [];
  let current: KohlerCsvGroup | null = null;

  for (const line of lines.slice(1)) {
    const update = /^Last update\s+(\S+)/i.exec(line);
    if (update) {
      lastUpdate = update[1];
      continue;
    }
    const header = GROUP_HEADER.exec(line.trim());
    if (header) {
      current = { code: header[1], name: header[2].trim(), parts: [] };
      groups.push(current);
      continue;
    }
    // Antes do primeiro grupo vem o sumário ("01;CrankShaft"); depois do cabeçalho da tabela, as peças.
    if (!current || !line.trim() || line.startsWith('Pos;')) continue;

    const fields = splitFields(line);
    const partNumber = (fields[3] ?? '').trim();
    if (!partNumber) continue;
    const name = (fields[4] ?? '').trim();
    const quantity = Number((fields[6] ?? '').trim());
    current.parts.push({
      position: (fields[0] ?? '').trim() || null,
      kit: (fields[1] ?? '').trim() || null,
      includedIn: (fields[2] ?? '').trim() || null,
      partNumber,
      name,
      note: (fields[5] ?? '').trim() || null,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
      techInfo: Boolean((fields[7] ?? '').trim()),
      discontinued: /discontinued|#dsc/i.test(name),
    });
  }

  if (!groups.length) return null;
  return { spec: title[1].toUpperCase(), lastUpdate, groups };
}
