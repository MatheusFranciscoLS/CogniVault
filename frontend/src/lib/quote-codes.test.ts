import { describe, expect, it } from 'vitest';
import { cleanCode, clipboardCodes } from './quote-codes';

describe('clipboardCodes', () => {
  it('um código por linha, com a quantidade depois de um TAB', () => {
    const { text, count } = clipboardCodes([
      { partNumber: '587106701', quantity: 1 },
      { partNumber: '501691702', quantity: 2 },
    ]);
    expect(text).toBe('587106701\t1\n501691702\t2');
    expect(count).toBe(2);
  });

  it('usa o código vigente (effectiveCode) quando a peça foi substituída, limpo como o Clipp guarda', () => {
    const { text } = clipboardCodes([{ partNumber: '587 10 66-01', effectiveCode: '587 10 67-01', quantity: 1 }]);
    expect(text).toBe('587106701\t1');
  });

  it('o mesmo código em duas linhas (duas máquinas) soma a quantidade', () => {
    const { text, count } = clipboardCodes([
      { partNumber: '503443201', quantity: 1 },
      { partNumber: '503 44 32-01', quantity: 3 },
    ]);
    expect(text).toBe('503443201\t4');
    expect(count).toBe(1);
  });

  it('serviço avulso (óleo) não tem código de peça e fica de fora', () => {
    const { text, count } = clipboardCodes([
      { partNumber: 'SRV-OLEO-2T', quantity: 1 },
      { partNumber: '503443201', quantity: 1 },
    ]);
    expect(text).toBe('503443201\t1');
    expect(count).toBe(1);
  });

  it('quantidade inválida vira 1, e orçamento só de serviço devolve vazio', () => {
    expect(clipboardCodes([{ partNumber: '503443201', quantity: 0 }]).text).toBe('503443201\t1');
    expect(clipboardCodes([{ partNumber: 'SRV-OLEO-2T', quantity: 2 }])).toEqual({ text: '', count: 0 });
    expect(clipboardCodes([])).toEqual({ text: '', count: 0 });
  });

  it('cleanCode tira espaço e traço e põe em maiúscula', () => {
    expect(cleanCode('104m02-0002 f1')).toBe('104M020002F1');
    expect(cleanCode(null)).toBe('');
  });
});
