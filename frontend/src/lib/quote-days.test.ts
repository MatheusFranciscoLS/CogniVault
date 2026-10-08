import { describe, expect, it } from 'vitest';
import { dayLabel, groupByStoreDay, storeDayKey, storeTime } from './quote-days';

describe('dias da loja', () => {
  it('depois das 21h de São Paulo o dia continua o mesmo, mesmo com o UTC já no dia seguinte', () => {
    // 2026-10-08 02:35 UTC = 2026-10-07 23:35 em São Paulo
    expect(storeDayKey('2026-10-08T02:35:00Z')).toBe('2026-10-07');
    expect(storeTime('2026-10-08T02:35:00Z')).toBe('23:35');
  });

  it('Hoje, Ontem e data por extenso', () => {
    expect(dayLabel('2026-10-07', '2026-10-07')).toBe('Hoje');
    expect(dayLabel('2026-10-06', '2026-10-07')).toBe('Ontem');
    expect(dayLabel('2026-09-30', '2026-10-07')).toMatch(/Quarta-feira, 30\/09\/2026/);
    // virada de mês: ontem do dia 1º é o último do mês anterior
    expect(dayLabel('2026-09-30', '2026-10-01')).toBe('Ontem');
  });

  it('agrupa em sequência, na ordem em que chegaram', () => {
    const groups = groupByStoreDay([
      { id: 1, at: '2026-10-08T02:35:00Z' },
      { id: 2, at: '2026-10-08T01:00:00Z' },
      { id: 3, at: '2026-10-07T20:00:00Z' },
    ], item => item.at);
    expect(groups.map(group => [group.key, group.items.map(item => item.id)])).toEqual([
      ['2026-10-07', [1, 2, 3]],
    ]);
    const outros = groupByStoreDay([{ at: '2026-10-08T12:00:00Z' }, { at: '2026-10-07T12:00:00Z' }], item => item.at);
    expect(outros.map(group => group.key)).toEqual(['2026-10-08', '2026-10-07']);
  });
});
