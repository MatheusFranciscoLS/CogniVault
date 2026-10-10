import { describe, expect, it } from 'vitest';
import { daysSince } from './admin-queries';

describe('dias desde a última atualização da lista', () => {
  const now = Date.UTC(2026, 9, 10, 12, 0, 0);
  it('conta dias inteiros e hoje é zero', () => {
    expect(daysSince('2026-10-10T08:00:00Z', now)).toBe(0);
    expect(daysSince('2026-10-09T11:59:00Z', now)).toBe(1);
    expect(daysSince('2026-09-30T12:00:00Z', now)).toBe(10);
  });
  it('data no futuro (relógio diferente) vira zero e valor ruim vira nulo', () => {
    expect(daysSince('2026-10-12T00:00:00Z', now)).toBe(0);
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince(undefined, now)).toBeNull();
    expect(daysSince('nao e data', now)).toBeNull();
    expect(daysSince('', now)).toBeNull();
  });
});
