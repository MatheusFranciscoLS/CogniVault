type ReadinessProbeOptions = {
  successTtlMs?: number;
  failureTtlMs?: number;
  now?: () => number;
};

export function createReadinessProbe(
  check: () => Promise<unknown>,
  options: ReadinessProbeOptions = {},
): () => Promise<boolean> {
  const successTtlMs = Math.max(0, options.successTtlMs ?? 5_000);
  const failureTtlMs = Math.max(0, options.failureTtlMs ?? 2_000);
  const now = options.now ?? Date.now;

  let cached: { ready: boolean; expiresAt: number } | null = null;
  let inFlight: Promise<boolean> | null = null;

  return async () => {
    const currentTime = now();
    if (cached && currentTime < cached.expiresAt) return cached.ready;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      let ready = false;
      try {
        await check();
        ready = true;
      } catch {
        ready = false;
      }

      cached = {
        ready,
        expiresAt: now() + (ready ? successTtlMs : failureTtlMs),
      };
      return ready;
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  };
}
