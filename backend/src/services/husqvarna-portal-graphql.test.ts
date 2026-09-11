import assert from 'node:assert/strict';
import test from 'node:test';
import { extractExactProductMatch, extractProductDetailsSummary } from './husqvarna-portal-graphql.service';

test('confirma produto quando selectedArticle bate exatamente com o PNC', () => {
  const payload = {
    data: {
      site: {
        search: {
          content: {
            results: [
              {
                resultItem: {
                  __typename: 'Machine',
                  id: 'machine-327p5x',
                  sku: '327P5X',
                  url: '/br/serrotes-com-cabo/327p5x/',
                  brand: 'Husqvarna',
                  selectedArticle: '965195201',
                  isDiscontinued: true,
                  name: { productName: '327P5x' },
                  primaryArticle: {
                    id: '965195201',
                    commercialReference: '965 19 52-01',
                    name: '327P5x',
                    isDiscontinued: true,
                  },
                  category: {
                    id: 'pole-saws',
                    name: 'Serrotes com cabo',
                    url: '/br/serrotes-com-cabo/',
                  },
                },
              },
            ],
          },
        },
      },
    },
  };

  const result = extractExactProductMatch(payload, '965195201');
  assert.ok(result);
  assert.equal(result.productName, 'HUSQVARNA 327P5x');
  assert.equal(result.discontinued, true);
  assert.equal(result.portalUrl, 'https://portal.husqvarnagroup.com/br/serrotes-com-cabo/327p5x/?article=965195201');
  assert.equal(result.category?.name, 'Serrotes com cabo');
});

test('aceita commercialReference formatado como prova exata após normalização', () => {
  const payload = {
    data: {
      site: {
        search: {
          content: {
            results: [
              {
                resultItem: {
                  __typename: 'Machine',
                  id: 'machine-x',
                  sku: 'modelo-x',
                  url: '/br/rocadeiras/modelo-x/',
                  selectedArticle: null,
                  isDiscontinued: false,
                  name: { productName: 'Modelo X' },
                  primaryArticle: {
                    id: 'article-x',
                    commercialReference: '970 55 00-20',
                    name: 'Modelo X',
                  },
                },
              },
            ],
          },
        },
      },
    },
  };

  const result = extractExactProductMatch(payload, '970550020');
  assert.ok(result);
  assert.equal(result.portalUrl, 'https://portal.husqvarnagroup.com/br/rocadeiras/modelo-x/?article=970550020');
});

test('rejeita resultado de busca parecido quando nenhum identificador bate exatamente', () => {
  const payload = {
    data: {
      site: {
        search: {
          content: {
            results: [
              {
                resultItem: {
                  __typename: 'Machine',
                  id: 'machine-wrong',
                  sku: '965195299',
                  url: '/br/serrotes-com-cabo/outro-modelo/',
                  selectedArticle: '965195299',
                  name: { productName: 'Outro modelo' },
                  primaryArticle: {
                    id: '965195299',
                    commercialReference: '965 19 52-99',
                    name: 'Outro modelo',
                  },
                },
              },
            ],
          },
        },
      },
    },
  };

  assert.equal(extractExactProductMatch(payload, '965195201'), null);
});

test('rejeita URL externa mesmo quando o PNC bate', () => {
  const payload = {
    data: {
      site: {
        search: {
          content: {
            results: [
              {
                resultItem: {
                  __typename: 'Machine',
                  id: 'machine-unsafe',
                  sku: '965195201',
                  url: 'https://example.com/falso',
                  selectedArticle: '965195201',
                  name: { productName: '327P5x' },
                },
              },
            ],
          },
        },
      },
    },
  };

  assert.equal(extractExactProductMatch(payload, '965195201'), null);
});

test('extrai apenas vistas explodidas do artigo exato retornado pelo Portal', () => {
  const payload = {
    data: {
      site: {
        articles: {
          byIds: [
            {
              id: '965195201',
              isDiscontinued: true,
              name: { productName: 'HUSQVARNA 327P5x' },
              articleDescription: 'All ex US50, Lowes',
              product: {
                category: { name: 'Serrotes com cabo' },
                productDocuments: [
                  { url: 'https://cdn-portal.husqvarnagroup.com/doc.pdf', publicationType: 'IPL' },
                ],
              },
              iplDocuments: [],
              ipls: [
                {
                  id: 'HVA_PL-000010489',
                  name: 'CARBURADOR',
                  image: 'https://p3.aprimocdn.net/husqvarna/carb.png',
                  referenceHeight: '2204',
                  referenceWidth: '1573',
                },
                {
                  id: 'HVA_PL-000010490',
                  name: 'CABEÇA DA SERRA',
                  image: 'https://p3.aprimocdn.net/husqvarna/saw.png',
                  referenceHeight: '2300',
                  referenceWidth: '1600',
                },
              ],
            },
          ],
        },
      },
    },
  };

  const result = extractProductDetailsSummary(payload, '965195201');
  assert.ok(result);
  assert.equal(result.productName, 'HUSQVARNA 327P5x');
  assert.equal(result.discontinued, true);
  assert.equal(result.categoryName, 'Serrotes com cabo');
  assert.equal(result.iplSections.length, 2);
  assert.equal(result.iplSections[0].id, 'HVA_PL-000010489');
  assert.equal(result.iplSections[1].name, 'CABEÇA DA SERRA');
  assert.equal(result.productDocumentCount, 1);
  assert.equal(result.iplDocumentCount, 0);
});

test('detalhes GraphQL não podem validar um artigo diferente do PNC consultado', () => {
  const payload = {
    data: {
      site: {
        articles: {
          byIds: [
            {
              id: '965195299',
              isDiscontinued: false,
              name: { productName: 'Outro produto' },
              ipls: [{ id: 'HVA_PL-000099999', name: 'SEÇÃO ERRADA' }],
            },
          ],
        },
      },
    },
  };

  assert.equal(extractProductDetailsSummary(payload, '965195201'), null);
});
