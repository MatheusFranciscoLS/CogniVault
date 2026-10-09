import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildQuotePdf } from './quote-pdf';
import { makePdfSafe, pdfSafeText } from './pdf-text';

describe('texto que o PDF do cliente aguenta', () => {
  it('emoji e caracteres invisíveis saem; o resto da frase fica', () => {
    expect(pdfSafeText('Item 😀 ção')).toBe('Item ção');
    expect(pdfSafeText('João 🚜 Müller & Cia')).toBe('João Müller & Cia');
    expect(pdfSafeText('Bandeira 🇧🇷 e família 👨‍👩‍👧 e tom 👍🏽')).toBe('Bandeira e família e tom');
    expect(pdfSafeText('Zero' + String.fromCharCode(0x200b) + 'width' + String.fromCharCode(0xfeff))).toBe('Zerowidth');
    expect(pdfSafeText('1' + String.fromCharCode(0xfe0f) + String.fromCharCode(0x20e3) + ' item')).toBe('1 item');
  });

  it('acento, pontuação do Windows e símbolos do Latin-1 continuam', () => {
    const texto = 'Peça nº 5 – “aspas” • ½ × 2 € ™ © ® ° ñ ß ü ÿ Œ';
    expect(pdfSafeText(texto)).toBe(texto);
  });

  it('acento "solto" (a + til) é recomposto em vez de virar lixo', () => {
    expect(pdfSafeText('a' + String.fromCharCode(0x303) + 'o')).toBe('ão');
  });

  it('símbolos comuns viram letras; o que não tem equivalente vira "?" (a falta aparece)', () => {
    expect(pdfSafeText('≥ 5 → 6 ≤ 7')).toBe('>= 5 -> 6 <= 7');
    expect(pdfSafeText('日本語')).toBe('???');
    expect(pdfSafeText('مرحبا')).toBe('?????');
    expect(pdfSafeText('Привет')).toBe('??????');
  });

  it('controle e quebra de linha: \n e \t ficam, \r e o resto saem; vazio e lixo não quebram', () => {
    expect(pdfSafeText('a\r\nb\tc\u0007d')).toBe('a\nb\tcd');
    expect(pdfSafeText('')).toBe('');
    expect(pdfSafeText(undefined as never)).toBe('');
    expect(pdfSafeText(null as never)).toBe('');
    expect(pdfSafeText('x'.repeat(100_000))).toHaveLength(100_000);
  });

  it('instalar a limpeza duas vezes não empilha', () => {
    const doc = makePdfSafe(makePdfSafe(new jsPDF('p', 'pt', 'a4')));
    expect(doc.getTextWidth('abc 😀')).toBeCloseTo(doc.getTextWidth('abc'), 5);
  });

  it('no PDF do orçamento: o emoji do nome e da descrição NÃO estraga o espaçamento nem deixa lixo', () => {
    const item = { partNumber: 'SRV-1', name: 'Item 1 😀 ção', model: '', quantity: 1, unitPrice: 12.5 };
    const doc = buildQuotePdf({ doc: new jsPDF('p', 'pt', 'a4'), autoTable, items: [item], options: { customerName: 'João 🚜 日本', paymentMethod: 'À vista', discountPercentage: 0 }, now: new Date(2026, 9, 7) });
    const bruto = new TextDecoder('latin1').decode(doc.output('arraybuffer')).replace(/\\([()])/g, '$1');
    expect(bruto).toContain('Item 1 ção');
    expect(bruto).toContain('João ??');
    expect(bruto).not.toContain('Ø=Þ');
    expect(bruto).not.toContain('I t e m');
  });
});
