import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHusqvarnaSearchPayload } from './husqvarna-product-search.service';

test('normaliza a busca múltipla oficial em produtos, peças, acessórios, documentos e categorias', () => {
  const payload = {
    data: {
      site: {
        search: {
          products: {
            results: {
              resultItem: [{
                id: 'machine-1',
                url: '/br/motosserras/55/',
                selectedArticle: '967052465',
                isDiscontinued: true,
                numberOfVariants: 3,
                name: { productName: 'HUSQVARNA 55' },
                mainImageData: { url: 'https://media.husqvarnagroup.com/image/H110-0036.png' },
                primaryArticle: { id: '967052465', name: 'HUSQVARNA 55' },
                category: { name: 'Motosserras' },
              }],
            },
          },
          accessories: {
            results: {
              resultItem: [{
                id: 'accessory-1',
                url: '/br/acessorios/cinto/',
                selectedArticle: '579653601',
                name: { productName: 'Cinto Balance' },
                primaryArticle: { id: '579653601', articleDescription: 'Cinto profissional' },
                category: { name: 'Acessórios' },
              }],
            },
          },
          spareparts: {
            results: {
              resultItem: [{
                id: '503123401',
                articleNumberFormatted: '503 12 34-01',
                name: 'PARAFUSO',
                description: 'Parafuso de fixação',
                url: '/br/spare-parts/?part=503123401',
              }],
            },
          },
          documents: {
            results: {
              resultItem: [{
                url: 'https://cdn-portal.husqvarnagroup.com/b2b/doc/om',
                fileFormat: 'pdf',
                languages: ['PT'],
                lastUpdated: '2020-09-01T00:00:00',
                publicationTitle: 'OM, 55, 2020-09',
                publicationType: 'OM',
              }],
            },
          },
          categories: {
            results: {
              resultItem: [{
                id: 'category-1',
                name: 'Motosserras',
                url: '/br/motosserras/',
                productCount: 12,
                image: { url: 'https://media.husqvarnagroup.com/category.png' },
              }],
            },
          },
        },
      },
    },
  };

  const results = parseHusqvarnaSearchPayload(payload);
  assert.equal(results.length, 5);
  assert.deepEqual(results.map(item => item.kind), ['PRODUCT', 'SPARE_PART', 'ACCESSORY', 'DOCUMENT', 'CATEGORY']);

  const product = results.find(item => item.kind === 'PRODUCT');
  assert.equal(product?.pnc, '967052465');
  assert.equal(product?.portalUrl, 'https://portal.husqvarnagroup.com/br/motosserras/55/?article=967052465');
  assert.equal(product?.discontinued, true);

  const spare = results.find(item => item.kind === 'SPARE_PART');
  assert.equal(spare?.partNumber, '503123401');

  const document = results.find(item => item.kind === 'DOCUMENT');
  assert.equal(document?.documentType, 'OM');
  assert.deepEqual(document?.languages, ['PT']);
  assert.equal(document?.lastUpdated, '2020-09-01T00:00:00');

  const category = results.find(item => item.kind === 'CATEGORY');
  assert.equal(category?.productCount, 12);
});

test('tolera results/resultItem como coleções ou objetos únicos', () => {
  const payload = {
    data: {
      site: {
        search: {
          products: {
            results: [{
              resultItem: {
                id: 'machine-1',
                url: '/br/motosserras/55/',
                selectedArticle: '967052465',
                name: { productName: '55' },
                primaryArticle: { id: '967052465' },
              },
            }],
          },
        },
      },
    },
  };

  const results = parseHusqvarnaSearchPayload(payload);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'HUSQVARNA 55');
});
