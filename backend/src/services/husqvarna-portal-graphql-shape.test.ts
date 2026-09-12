import assert from 'node:assert/strict';
import test from 'node:test';
import { extractExactProductMatch, extractVerifiedProductMatch } from './husqvarna-portal-graphql.service';

function husqvarna55Payload(selectedArticle: string | null = '967052465') {
  return {
    data: {
      site: {
        search: {
          content: {
            results: {
              facet: {
                count: 1,
                name: 'MACHINES',
                displayName: null,
                type: 'TOTAL',
              },
              facets: [],
              resultItem: [
                {
                  __typename: 'Machine',
                  id: '{FCB3F8CD-3628-4113-8A15-58339812BBCB}',
                  sku: 'MP_125560574',
                  url: '/br/motosserras/55/?article=967052465',
                  brand: 'Husqvarna',
                  selectedArticle,
                  isDiscontinued: true,
                  name: { productName: 'HUSQVARNA 55' },
                  primaryArticle: {
                    id: '967052465',
                    commercialReference: null,
                    name: 'HUSQVARNA 55',
                    isDiscontinued: true,
                  },
                  category: {
                    id: '{742C6358-775C-4D2B-BD38-EFD20209A081}',
                    name: 'Motosserras',
                    url: '/br/motosserras/',
                  },
                  subCategories: [],
                },
              ],
            },
          },
        },
      },
    },
  };
}

test('extrai o produto exato do formato real products.results.resultItem[] da Husqvarna', () => {
  const result = extractExactProductMatch(husqvarna55Payload(), '967052465');

  assert.ok(result);
  assert.equal(result.productName, 'HUSQVARNA 55');
  assert.equal(result.pnc, '967052465');
  assert.equal(result.discontinued, true);
  assert.equal(result.category?.name, 'Motosserras');
  assert.equal(result.portalUrl, 'https://portal.husqvarnagroup.com/br/motosserras/55/?article=967052465');
});

test('recupera a rota por produto e categoria já confirmados quando o item não repete o PNC', () => {
  const payload = husqvarna55Payload(null);
  payload.data.site.search.content.results.resultItem[0].primaryArticle.id = 'outro-artigo';

  const result = extractVerifiedProductMatch(payload, '967052465', {
    productName: 'HUSQVARNA 55',
    categoryName: 'Motosserras',
  });

  assert.ok(result);
  assert.equal(result.portalUrl, 'https://portal.husqvarnagroup.com/br/motosserras/55/?article=967052465');
});

test('mantém compatibilidade defensiva se resultItem vier como objeto único', () => {
  const payload = husqvarna55Payload();
  const hit = payload.data.site.search.content.results.resultItem[0];
  const defensivePayload = {
    data: {
      site: {
        search: {
          content: {
            results: {
              resultItem: hit,
            },
          },
        },
      },
    },
  };

  const result = extractExactProductMatch(defensivePayload, '967052465');
  assert.ok(result);
  assert.equal(result.productName, 'HUSQVARNA 55');
});
