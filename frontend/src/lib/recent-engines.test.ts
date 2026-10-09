import { afterEach, describe, expect, it } from 'vitest';
import { loadRecentEngines, pushRecentEngine, saveRecentEngines, type RecentEngine } from './recent-engines';

const kawasaki: RecentEngine = { brand: 'Kawasaki', model: 'FX921V-ES06' };
const kohler: RecentEngine = { brand: 'Kohler', model: 'SV540-3212' };

afterEach(() => localStorage.clear());

describe('últimos motores digitados', () => {
  it('o mais novo vai na frente e o repetido sobe sem duplicar', () => {
    let list = pushRecentEngine([], kawasaki);
    list = pushRecentEngine(list, kohler);
    expect(list.map(item => item.model)).toEqual(['SV540-3212', 'FX921V-ES06']);
    list = pushRecentEngine(list, { brand: 'Kawasaki', model: 'fx921v-es06' });
    expect(list.map(item => item.model)).toEqual(['fx921v-es06', 'SV540-3212']);
  });

  it('respeita o limite e ignora modelo vazio', () => {
    let list: RecentEngine[] = [];
    for (let n = 0; n < 10; n += 1) list = pushRecentEngine(list, { brand: 'Kohler', model: `SV54${n}-3212` });
    expect(list).toHaveLength(6);
    expect(list[0].model).toBe('SV549-3212');
    expect(pushRecentEngine(list, { brand: 'Kohler', model: '  ' })).toBe(list);
  });

  it('grava e lê de volta; lixo no armazenamento vira lista vazia', () => {
    saveRecentEngines([kohler, kawasaki]);
    expect(loadRecentEngines()).toEqual([kohler, kawasaki]);
    localStorage.setItem('cognivault_recent_engines', '{quebrado');
    expect(loadRecentEngines()).toEqual([]);
    localStorage.setItem('cognivault_recent_engines', JSON.stringify([{ brand: 'Yamaha', model: 'X1' }, { brand: 'Kohler', model: 42 }, kohler]));
    expect(loadRecentEngines()).toEqual([kohler]);
  });
});
