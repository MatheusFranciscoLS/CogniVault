import assert from 'node:assert/strict';
import test from 'node:test';
import { extractExactProductMatch, extractVerifiedProductMatch } from './husqvarna-portal-graphql.service';

test('aceita results como objeto único na busca GraphQL da Husqvarna', () => {
  const payload = {
    data: {
      site: {
        search: {
          content: {
            results: {
              resultItem: {
                __typename: 'Machine',
                id: 'machine-55',
                sku: '55',
                url: '/br/motosserras/55/',
                selectedArticle: '967052465',
                isDiscontinued: true,
                name: { productName: '55' },
                primaryArticle: {
                  id: '967052465',
                  commercialReference: '967 05 24-65',
                  name: '55',
                  isDiscontinued: true,
                },
                category: {
                  id: 'chainsaws',
                  name: 'Motosserras',
                  url: '/br/motosserras/',
                },
              },
            },
          },
        },
      },
    },
  };

  const result = extractExactProductMatch(payload, '967052465');
  assert.ok(result);
  assert.equal(result.productName, 'HUSQVARNA 55');
  assert.equal(result.portalUrl, 'https://portal.husqvarnagroup.com/br/motosserras/55/?article=967052465');
});

test('recupera rota por produto e categoria confirmados quando results é objeto único', () => {
  const payload = {
    data: {
      site: {
        search: {
          content: {
            results: {
              resultItem: {
                __typename: 'Machine',
                id: 'machine-55',
                sku: '55',
                url: '/br/motosserras/55/',
                selectedArticle: null,
                isDiscontinued: true,
                name: { productName: '55' },
                primaryArticle: {
                  id: 'old-article-id',
                  commercialReference: null,
                  name: '55',
                  isDiscontinued: true,
                },
                category: {
                  id: 'chainsaws',
                  name: 'Motosserras',
                  url: '/br/motosserras/',
                },
              },
            },
          },
        },
      },
    },
  };

  const result = extractVerifiedProductMatch(payload, '967052465', {
    productName: 'HUSQVARNA 55',
    categoryName: 'Motosserras',
  });
  assert.ok(result);
  assert.equal(result.portalUrl, 'https://portal.husqvarnagroup.com/br/motosserras/55/?article=967052465');
});
