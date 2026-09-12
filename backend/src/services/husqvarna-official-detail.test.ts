import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOfficialProductDetails, parseOfficialSparePart } from './husqvarna-official-detail.service';
import { buildHusqvarnaPublicSupportUrl } from './husqvarna-public-support.service';

test('extrai IPL completo, especificações, variantes, documentos e acessórios do artigo exato', () => {
  const payload = {
    site: {
      articles: {
        byIds: [{
          id: '965195201',
          isDiscontinued: true,
          articleDescription: 'All ex US50, Lowes',
          name: { productName: 'HUSQVARNA 327P5x' },
          specificationValues: [{ id: 'weight', formattedValue: '5,0 kg' }],
          product: {
            category: { name: 'Serrotes com cabo' },
            productDocuments: [
              { url: 'https://cdn-portal.husqvarnagroup.com/doc/om', fileFormat: 'pdf', publicationTitle: 'OM PT', publicationType: 'OM', languages: ['PT'] },
              { url: 'https://cdn-portal.husqvarnagroup.com/doc/ipl', fileFormat: 'pdf', publicationTitle: 'IPL EN', publicationType: 'IPL', languages: ['EN'] },
            ],
            specifications: { specificationGroups: [{ id: 'general', name: 'Produto', specifications: [{ id: 'weight', name: 'Peso' }] }] },
            articles: [
              { id: '965195201', articleDescription: 'Variante A' },
              { id: '965195202', articleDescription: 'Variante B' },
            ],
          },
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
              url: '/br/spare-parts/?part=503123401',
            }],
          }],
        }],
      },
    },
  };

  const result = parseOfficialProductDetails(payload, '965195201');
  assert.ok(result);
  assert.equal(result.productName, 'HUSQVARNA 327P5x');
  assert.equal(result.specifications[0].name, 'Peso');
  assert.equal(result.specifications[0].value, '5,0 kg');
  assert.equal(result.variants.length, 2);
  assert.equal(result.documents[0].languages[0], 'PT');
  assert.equal(result.accessories[0].name, 'Cinto');
  assert.equal(result.alsoUsedIn[0].pnc, '970000001');
  assert.equal(result.iplSections[0].parts[0].position, '7');
  assert.equal(result.iplSections[0].parts[0].partNumber, '503123401');
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
