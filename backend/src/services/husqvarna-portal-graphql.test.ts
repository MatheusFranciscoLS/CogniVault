import assert from 'node:assert/strict';
import test from 'node:test';
import { extractExactProductMatch, extractProductDetailsSummary, extractVerifiedProductMatch } from './husqvarna-portal-graphql.service';

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

test('recupera rota canônica quando artigo exato já confirmou produto e categoria', () => {
  const payload = {
    data: {
      site: {
        search: {
          content: {
            results: [
              {
                resultItem: {
                  __typename: 'Machine',
                  id: 'machine-55',
                  sku: '55',
                  url: '/br/motosserras/55/',
                  selectedArticle: null,
                  isDiscontinued: true,
                  name: { productName: '55' },
                  primaryArticle: {
                    id: '967052401',
                    commercialReference: '967 05 24-01',
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
            ],
          },
        },
      },
    },
  };

  assert.equal(extractExactProductMatch(payload, '967052465'), null);
  const result = extractVerifiedProductMatch(payload, '967052465', {
    productName: 'HUSQVARNA 55',
    categoryName: 'Motosserras',
  });
  assert.ok(result);
  assert.equal(result.portalUrl, 'https://portal.husqvarnagroup.com/br/motosserras/55/?article=967052465');
});

test('não recupera rota por nome quando a categoria confirmada diverge', () => {
  const payload = {
    data: {
      site: {
        search: {
          content: {
            results: [
              {
                resultItem: {
                  __typename: 'Machine',
                  id: 'machine-55-wrong',
                  sku: '55',
                  url: '/br/rocadeiras/55/',
                  name: { productName: '55' },
                  category: { id: 'brushcutters', name: 'Roçadeiras', url: '/br/rocadeiras/' },
                },
              },
            ],
          },
        },
      },
    },
  };

  assert.equal(extractVerifiedProductMatch(payload, '967052465', {
    productName: 'HUSQVARNA 55',
    categoryName: 'Motosserras',
  }), null);
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

test('artigo descontinuado continua confirmado mesmo sem vistas explodidas estruturadas', () => {
  const payload = {
    data: {
      site: {
        articles: {
          byIds: [
            {
              id: '967052465',
              isDiscontinued: true,
              name: { productName: 'HUSQVARNA 55' },
              articleDescription: '15 - 3/8 - CE - TR, SA, Latin America',
              product: {
                category: { name: 'Motosserras' },
                productDocuments: [],
              },
              iplDocuments: [],
              ipls: [],
            },
          ],
        },
      },
    },
  };

  const result = extractProductDetailsSummary(payload, '967052465');
  assert.ok(result);
  assert.equal(result.productName, 'HUSQVARNA 55');
  assert.equal(result.discontinued, true);
  assert.equal(result.categoryName, 'Motosserras');
  assert.equal(result.iplSections.length, 0);
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

test('documentos oficiais sobrevivem à extração, em ordem útil ao balcão', () => {
  const payload = {
    data: {
      site: {
        articles: {
          byIds: [
            {
              id: '967332904',
              name: { productName: '143RII' },
              product: {
                category: { name: 'Roçadeiras' },
                productDocuments: [
                  // Fora de ordem de propósito: o esperado é PT primeiro e
                  // manual do operador (OM) antes da lista de peças (IPL).
                  { url: 'https://cdn-portal.husqvarnagroup.com/ipl-en.pdf', publicationType: 'IPL', publicationTitle: 'Parts list', languages: ['EN'], fileFormat: 'PDF' },
                  { url: 'https://cdn-portal.husqvarnagroup.com/om-pt.pdf', publicationType: 'OM', publicationTitle: 'Manual do operador', languages: ['PT'], fileFormat: 'PDF' },
                  { url: 'https://cdn-portal.husqvarnagroup.com/outro.pdf', publicationType: 'SPEC', publicationTitle: 'Ficha técnica', languages: ['EN'], fileFormat: 'PDF' },
                  // Domínio de terceiro: não pode virar href no balcão.
                  { url: 'https://atacante.net/malicioso.pdf', publicationType: 'OM', publicationTitle: 'Falso', languages: ['PT'] },
                ],
              },
              iplDocuments: [
                { documentId: 'D1', publicationTitle: 'Vista explodida', url: 'https://cdn-portal.husqvarnagroup.com/vista.pdf' },
                // Mesma URL já vinda de productDocuments: identidade é a URL.
                { documentId: 'D2', publicationTitle: 'Parts list', url: 'https://cdn-portal.husqvarnagroup.com/ipl-en.pdf' },
              ],
              ipls: [],
            },
          ],
        },
      },
    },
  };

  const result = extractProductDetailsSummary(payload, '967332904');
  assert.ok(result);

  const urls = result.documents.map(document => document.url);
  assert.equal(urls.includes('https://atacante.net/malicioso.pdf'), false, 'domínio de terceiro deve ser descartado');
  assert.equal(new Set(urls).size, urls.length, 'não deve repetir a mesma URL');

  assert.equal(result.documents[0].title, 'Manual do operador');
  assert.equal(result.documents[0].type, 'OM');
  assert.equal(result.documents[0].fileFormat, 'PDF');

  // Depois do PT vêm os demais, com IPL antes de outros tipos.
  const typesAfterFirst = result.documents.slice(1).map(document => document.type);
  assert.deepEqual(typesAfterFirst, ['IPL', 'IPL', 'SPEC']);

  // A contagem antiga continua sendo a do payload cru, não a da lista saneada.
  assert.equal(result.productDocumentCount, 4);
  assert.equal(result.iplDocumentCount, 2);
});

test('artigo sem documento devolve lista vazia, não undefined', () => {
  const payload = {
    data: {
      site: {
        articles: {
          byIds: [
            { id: '965195201', name: { productName: '327P5x' }, product: { category: { name: 'X' } }, ipls: [] },
          ],
        },
      },
    },
  };

  const result = extractProductDetailsSummary(payload, '965195201');
  assert.ok(result);
  assert.deepEqual(result.documents, []);
});
