import { readFileSync, writeFileSync } from 'node:fs';
const edit = (p, pares) => {
  let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  for (const [a, b] of pares) { if (!s.includes(a)) throw new Error(p + ': não achei ' + a.slice(0, 80)); s = s.replace(a, () => b); }
  writeFileSync(p, s);
};
const L = 'frontend/src/lib/';
edit(L + 'quote-message.ts', [
  ["    if (!isServiceLine(item)) out.push(`   Código: \`${displayCode(item)}\``);\n", ""],
  ["    if (item.isSuperseded && item.originalCode) out.push(`   Substitui o código \`${displayCode(item, item.originalCode)}\``);\n", ""],
]);
edit(L + 'quote-pdf.ts', [
  ["  displayCode,\n", ""],
  ["    let description = item.name;\n    if (item.isSuperseded && item.originalCode) description += `\nSubstitui o código ${displayCode(item, item.originalCode)}`;\n", "    // Sem o código da peça: o cliente poderia cotar o mesmo código em outra revenda (dono, 2026-10-07).\n    let description = item.name;\n"],
  ["      String(index + 1),\n      isServiceLine(item) ? '' : displayCode(item),\n      description,", "      String(index + 1),\n      description,"],
  ["    head: [['#', 'Código', 'Descrição', 'Qtd', 'Valor unit.', 'Subtotal']],", "    head: [['#', 'Descrição', 'Qtd', 'Valor unit.', 'Subtotal']],"],
  [`      0: { cellWidth: 26, halign: 'center', textColor: MUTED },
      // Código em Courier negrito: é o que o cliente confere na peça e o que ele lê para outra pessoa.
      1: { cellWidth: 92, font: 'courier', fontStyle: 'bold', fontSize: 10.5 },
      3: { cellWidth: 34, halign: 'center' },
      4: { cellWidth: 74, halign: 'right' },
      5: { cellWidth: 78, halign: 'right', fontStyle: 'bold' },`, `      0: { cellWidth: 26, halign: 'center', textColor: MUTED },
      2: { cellWidth: 34, halign: 'center' },
      3: { cellWidth: 80, halign: 'right' },
      4: { cellWidth: 84, halign: 'right', fontStyle: 'bold' },`],
]);
edit(L + 'quote-message.test.ts', [
  ["  it('o código vem formatado como a etiqueta, em monoespaçado', () => {\n    expect(message).toContain('Código: `587 10 67-01`');\n  });", "  it('NÃO traz código de peça: o cliente poderia cotar o mesmo código em outra revenda', () => {\n    expect(message).not.toMatch(/587 ?10 ?67|587106701|501 ?69 ?17|501691702|Código/);\n    expect(message).toContain('CARBURADOR');\n  });"],
  ["  it('serviço avulso não ganha linha de código; peça substituída avisa o código antigo', () => {", "  it('serviço avulso e peça substituída também não mostram código, nem o antigo', () => {"],
  ["    expect(service).not.toContain('Código:');\n    expect(text).toContain('Substitui o código `587 10 66-01`');", "    expect(service).not.toContain('Código');\n    expect(text).not.toMatch(/587 ?10 ?66|587106601|Substitui/);"],
]);
edit(L + 'quote-pdf.test.ts', [
  ["  it('traz os códigos como a etiqueta, os valores com milhar e o total igual ao do servidor', () => {\n    expect(texto).toContain('587 10 67-01');\n", "  it('traz os valores com milhar e o total igual ao do servidor, e NENHUM código de peça', () => {\n    expect(texto).not.toMatch(/587 ?10 ?67|587106701|501691702|Código/);\n"],
]);
edit('frontend/src/components/QuickQuoteCart.tsx', [
  ["              <th className=\"w-36 py-2.5 font-bold\">Código oficial</th>\n", ""],
  ["              <th className=\"w-44 py-2.5 font-bold\">Modelo / aplicação</th>", "              <th className=\"w-44 py-2.5 font-bold\">Máquina</th>"],
  ["                <td className=\"py-2.5 font-mono font-bold text-ink-900\">\n                  {item.manufacturer?.toLowerCase().includes('husqvarna')\n                    ? formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber)\n                    : (item.effectiveCode || item.partNumber)}\n                </td>\n", ""],
  ["                  {item.name} {item.isSuperseded ? '★ (Substituição oficial)' : ''}\n", "                  {item.name}\n"],
  ["                  {item.model} {item.pnc ? `· PNC ${item.pnc}` : ''} {item.position ? `· Pos. ${item.position}` : ''}\n", "                  {item.model}\n"],
]);
