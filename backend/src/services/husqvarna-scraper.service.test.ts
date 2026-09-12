import assert from 'node:assert/strict';
import test from 'node:test';
import { HusqvarnaScraperService } from './husqvarna-scraper.service';

test('does not cache parser failures as a missing Husqvarna part', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response('<html><body>temporary portal markup</body></html>', { status: 200 });
  }) as typeof fetch;

  try {
    const code = '991234567801';
    assert.equal(await HusqvarnaScraperService.fetchLiveData(code, 0), null);
    assert.equal(await HusqvarnaScraperService.fetchLiveData(code, 0), null);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses a short negative cache only for an explicit 404', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const code = '991234567802';
    assert.equal(await HusqvarnaScraperService.fetchLiveData(code, 0), null);
    assert.equal(await HusqvarnaScraperService.fetchLiveData(code, 0), null);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps successful scraper results cached', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const payload = {
    query: {
      site: {
        spareParts: {
          byId: {
            name: 'Filtro de teste',
            articleNumberFormatted: '991234567803',
            url: 'https://portal.husqvarnagroup.com/br/spare-parts/test',
            fitsTo: [{ name: 'Máquina de teste' }],
          },
        },
      },
    },
  };
  const html = `React.createElement(SparePartDetails, ${JSON.stringify(payload)}))}});`;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(html, { status: 200 });
  }) as typeof fetch;

  try {
    const code = '991234567803';
    const first = await HusqvarnaScraperService.fetchLiveData(code, 0);
    const second = await HusqvarnaScraperService.fetchLiveData(code, 0);
    assert.equal(first?.name, 'Filtro de teste');
    assert.equal(second?.name, 'Filtro de teste');
    assert.deepEqual(first?.fitsTo, ['Máquina de teste']);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
