import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as XLSX from 'xlsx';

test('SheetJS runtime preserves the XLSM read/write flow used by the commercial price importer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cognivault-xlsx-'));
  const filePath = join(directory, 'price-list.xlsm');

  try {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['CODIGO', 'DESCRICAO', 'PRECO'],
      ['503808302', 'Filtro de teste', 123.45],
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'LISTA_DE_PEÇAS');
    XLSX.writeFile(workbook, filePath, { bookType: 'xlsm' });

    const parsed = XLSX.readFile(filePath);
    const rows = XLSX.utils.sheet_to_json<Array<string | number>>(
      parsed.Sheets['LISTA_DE_PEÇAS'],
      { header: 1, raw: true, defval: '' },
    );

    assert.equal(rows[1]?.[0], '503808302');
    assert.equal(rows[1]?.[1], 'Filtro de teste');
    assert.equal(rows[1]?.[2], 123.45);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
