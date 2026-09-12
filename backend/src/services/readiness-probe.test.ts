import assert from 'node:assert/strict';
import test from 'node:test';
import { createReadinessProbe } from './readiness-probe';

test('concurrent readiness calls share one underlying check', async () => {
  let checks = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const probe = createReadinessProbe(async () => {
    checks += 1;
    await gate;
  }, { successTtlMs: 0, failureTtlMs: 0 });

  const first = probe();
  const second = probe();
  const third = probe();
  assert.equal(checks, 1);

  release();
  assert.deepEqual(await Promise.all([first, second, third]), [true, true, true]);
  assert.equal(checks, 1);
});

test('readiness cache reuses success briefly and retries after expiry', async () => {
  let checks = 0;
  let clock = 1_000;
  const probe = createReadinessProbe(async () => { checks += 1; }, {
    successTtlMs: 5_000,
    failureTtlMs: 2_000,
    now: () => clock,
  });

  assert.equal(await probe(), true);
  assert.equal(await probe(), true);
  assert.equal(checks, 1);

  clock += 5_001;
  assert.equal(await probe(), true);
  assert.equal(checks, 2);
});

test('failed readiness checks are cached only for the shorter failure window', async () => {
  let checks = 0;
  let clock = 1_000;
  const probe = createReadinessProbe(async () => {
    checks += 1;
    if (checks === 1) throw new Error('database unavailable');
  }, {
    successTtlMs: 5_000,
    failureTtlMs: 2_000,
    now: () => clock,
  });

  assert.equal(await probe(), false);
  assert.equal(await probe(), false);
  assert.equal(checks, 1);

  clock += 2_001;
  assert.equal(await probe(), true);
  assert.equal(checks, 2);
});
