import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOfficialProductDetails, parseOfficialSparePart } from './husqvarna-official-detail.service';
import { buildHusqvarnaPublicSupportUrl } from './husqvarna-public-support.service';

test('extrai detalhes oficiais, diferenças de variantes, documentos recentes e características', () => {
  const payload = {
    site: {
      articles: {
        byIds: [{
          id: '965195201',
          isDiscontinued: true,
          articleDescription: 'All ex US50, Lowes',
          name: { productName: 'HUSQVARNA 327P5x' },
          specificationValues: [
            { id: 'weight', formattedValue: '5,0 kg' },
            { id: 'length', formattedValue: '240 cm' },
          ],
          product: {
            category: { name: 'Serrotes com cabo' },
            productDocuments: [
              { url: 'https://cdn-portal.husqvarnagroup.com/doc/om-old', fileFormat: 'pdf', publicationTitle: 'OM PT antigo', publicationType: 'OM', languages: ['PT'], lastUpdated: '2010-01-01T00:00:00' },
              { url: 'https://cdn-portal.husqvarnagroup.com/doc/om-new', fileFormat: 'pdf', publicationTitle: 'OM PT novo', publicationType: 'OM', languages: ['PT'], lastUpdated: '2020-01-01T00:00:00' },
              { url: 'https://cdn-portal.husqvarnagroup.com/doc/ipl', fileFormat: 'pdf', publicationTitle: 'IPL EN', publicationType: 'IPL', languages: ['EN'], lastUpdated: '2022-01-01T00:00:00' },
            ],
            specifications: {
              specificationGroups: [{
                id: 'general',
                name: 'Produto',
                specifications: [
                  { id: 'weight', name: 'Peso' },
                  { id: 'length', name: 'Comprimento' },
                ],
              }],
            },
            articles: [
              { id: '965195201', articleDescription: 'Variante A', specificationValues: [{ id: 'weight', formattedValue: '5,0 kg' }, { id: 'length', formattedValue: '240 cm' }] },
              { id: '965195202', articleDescription: 'Variante B', specificationValues: [{ id: 'weight', formattedValue: '5,2 kg' }, { id: 'length', formattedValue: '300 cm' }] },
            ],
            sharedFeatures: [{
              id: 'feature-1',
              name: 'Baixa vibração',
              description: 'Recurso compartilhado',
              image: { url: 'https://media.husqvarnagroup.com/feature.png' },
              video: { link: 'https://www.husqvarna.com/video/feature' },
            }],
          },
          additionalFeatures: [{ id: 'feature-2', name: 'Ajuste rápido', description: 'Característica desta variante' }],
          relatedAccessories: { result: [{ id: '579653601', articleDescription: 'Acessório', name: { shortName: 'Cinto' }, product: { url: '/br/acessorios/cinto/', category: { name: 'Acessórios' } } }] },
          alsoUsedIn: [{ __typename: 'Machine', id: 'm1', primaryArticle: { articleNumberFormatted: '970 00 00-01' }, name: { shortName: 'Modelo Relacionado' }, category: { name: 'Roçadeiras' }, url: '/br/rocadeiras/modelo/', isDiscontinued: false }],
          ipls: [{
            id: 'HVA_PL-000010489',
            name: 'CARBURADOR',
            image: 'https://p3.aprimocdn.net/husqvarna/carb.png',
            referenceHeight: '2204',
            referenceWidth: '1573',
            articles: [{
              number: '7',
              quantity: 2,
              id: '503123401',
              name: 'Parafuso',
              articleDescription: 'PARAFUSO',
              commercialReference: '503 12 34-01',
              replacedIds: ['503123402'],
              coordinates: '10,20,30,40',
              comment: 'A partir do serial 12345',
              url: '/br/spare-parts/?part=503123401',
            }],
          }],
          spareParts: [],
        }],
      },
    },
  };

  const result = parseOfficialProductDetails(payload, '965195201');
  assert.ok(result);
  assert.equal(result.productName, 'HUSQVARNA 327P5x');
  assert.equal(result.specifications[0].name, 'Peso');
  assert.equal(result.variants.length, 2);
  assert.equal(result.variants[1].specifications.find(item => item.name === 'Peso')?.value, '5,2 kg');
  assert.equal(result.documents[0].title, 'OM PT novo');
  assert.equal(result.documents[0].isLatest, true);
  assert.equal(result.documents[1].title, 'OM PT antigo');
  assert.equal(result.documents[1].isLatest, false);
  assert.equal(result.features.length, 2);
  assert.equal(result.features[0].name, 'Baixa vibração');
  assert.equal(result.accessories[0].name, 'Cinto');
  assert.equal(result.alsoUsedIn[0].pnc, '970000001');
  assert.equal(result.iplSections[0].parts[0].position, '7');
  assert.equal(result.iplSections[0].parts[0].comment, 'A partir do serial 12345');
  assert.deepEqual(result.iplSections[0].parts[0].replacementPartNumbers, ['503123402']);
});

test('não aceita detalhes de PNC diferente', () => {
  const payload = { site: { articles: { byIds: [{ id: '965195299', name: { productName: 'Outro' } }] } } };
  assert.equal(parseOfficialProductDetails(payload, '965195201'), null);
});

test('confirma peça apenas quando um identificador GraphQL bate exatamente', () => {
  const payload = {
    site: {
      search: {
        content: {
          results: {
            resultItem: [{
              id: '503123401',
              articleNumberFormatted: '503 12 34-01',
              commercialReference: '503123401',
              description: 'PARAFUSO',
              name: 'Parafuso',
              url: '/br/spare-parts/?part=503123401',
            }],
          },
        },
      },
    },
  };
  const result = parseOfficialSparePart(payload, '503123401');
  assert.ok(result);
  assert.equal(result.name, 'Parafuso');
  assert.match(result.url || '', /portal\.husqvarnagroup\.com/);
  assert.equal(parseOfficialSparePart(payload, '503123499'), null);
});

test('gera URL pública de suporte sem depender da categoria do Portal', () => {
  assert.equal(buildHusqvarnaPublicSupportUrl('HUSQVARNA 120 Mark II'), 'https://www.husqvarna.com/br/suporte/120-mark-ii/');
  assert.equal(buildHusqvarnaPublicSupportUrl('HUSQVARNA 327P5x'), 'https://www.husqvarna.com/br/suporte/327p5x/');
});
