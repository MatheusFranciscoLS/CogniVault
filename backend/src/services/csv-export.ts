/**
 * Geração de CSV pensada para abrir com duplo clique no Excel pt-BR.
 *
 * Duas decisões que parecem detalhe mas são a diferença entre "abre" e "o dono
 * me liga dizendo que veio tudo embolado numa coluna":
 *  - separador `;`: no Windows com locale pt-BR o Excel usa ponto e vírgula como
 *    delimitador de lista. Com vírgula ele joga a linha inteira na coluna A.
 *  - BOM UTF-8: sem ele o Excel lê o arquivo como ANSI e "Óleo" vira "Ã“leo".
 *
 * Número decimal sai com vírgula, pelo mesmo motivo.
 */

export const CSV_SEPARATOR = ';';
export const CSV_BOM = '﻿';

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value).replace('.', ',');
  }

  if (value instanceof Date) {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(value);
  }

  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';

  const text = String(value);

  // Célula que começa com =, +, - ou @ é interpretada como fórmula pelo Excel.
  // Código de peça e descrição são dado do cliente, então prefixar com apóstrofo
  // impede que uma planilha exportada execute algo ao ser aberta.
  const sanitized = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  if (sanitized.includes('"') || sanitized.includes(CSV_SEPARATOR) || /[\r\n]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(CSV_SEPARATOR) + '\r\n';
}

export function csvMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return value.toFixed(2).replace('.', ',');
}

/** Nome de arquivo seguro para Content-Disposition, com data no fuso da loja. */
export function csvFilename(prefix: string): string {
  const stamp = new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
  return `${prefix}_${stamp}.csv`;
}
