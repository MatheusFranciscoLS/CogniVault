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

test('rejeita URL e mídia de domínios parecidos nos detalhes oficiais', () => {
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
              url: 'https://evilhusqvarnagroup.com/br/spare-parts/?part=503123401',
              mainImage: { url: 'https://fakehusqvarna.com/image.png' },
            }],
          },
        },
      },
    },
  };

  const result = parseOfficialSparePart(payload, '503123401');
  assert.ok(result);
  assert.equal(result.url, null);
  assert.equal(result.imageUrl, null);
});

test('gera URL pública de suporte sem depender da categoria do Portal', () => {
  assert.equal(buildHusqvarnaPublicSupportUrl('HUSQVARNA 120 Mark II'), 'https://www.husqvarna.com/br/suporte/120-mark-ii/');
  assert.equal(buildHusqvarnaPublicSupportUrl('HUSQVARNA 327P5x'), 'https://www.husqvarna.com/br/suporte/327p5x/');
});

test('o campo comment da vista vira informação pronta para o balcão', () => {
  // Textos reais da API: TS 142 (artigo 960410440) e motor HS 608.
  const payload = {
    site: {
      articles: {
        byIds: [{
          id: '960410440',
          name: { productName: 'HUSQVARNA TS 142' },
          product: { category: { name: 'Tratores de jardim' } },
          ipls: [{
            id: 'HVA_PL-TS142-MOTOR',
            name: 'MOTOR',
            referenceWidth: 900,
            referenceHeight: 620,
            articles: [
              { id: '598693901', number: 1, name: 'MOTOR', comment: 'For 96041044000. HUSQVARNA MODEL NO. HS608 (COMPLETE IPL AVAILABLE SEPARATELY).' },
              { id: '593230101', number: 1, name: 'MOTOR', comment: 'For 96041043000. HUSQVARNA MODEL NO. HS608 (COMPLETE IPL AVAILABLE SEPARATELY).' },
              { id: '587333501', number: 1, name: 'DUMMY PART', comment: 'For 96041036800, 96041036801. Engine Briggs Model No. 31R577-0027-B1 (587333501).' },
              { id: '599349078', number: 6, name: 'JUNTA', comment: 'CARBURETTOR GASKET - MULTIPACK: 10' },
              { id: '590645301', number: 2, name: 'SILENCIADOR', comment: null },
            ],
          }],
        }],
      },
    },
  };

  // Consulta feita com o artigo de 9 dígitos, como o portal identifica.
  const result = parseOfficialProductDetails(payload, '960410440');
  assert.ok(result, 'detalhes deveriam ser aceitos');
  const parts = result!.iplSections[0].parts;
  const byId = (id: string) => parts.find(p => p.partNumber === id)!;

  // Quem serve ESTE PNC: o texto escreve 11 dígitos, a consulta usa 9.
  assert.equal(byId('598693901').servesThisPnc, true, 'For 96041044000 atende o artigo 960410440');
  assert.equal(byId('593230101').servesThisPnc, false, 'For 96041043000 é a OUTRA variante');
  assert.equal(byId('587333501').servesThisPnc, false);
  // Sem "For ..." a peça vale para todas as variantes — recusar esconderia peça.
  assert.equal(byId('590645301').servesThisPnc, true);

  // Pacote fechado: o balcão promete uma e o cliente recebe dez.
  assert.equal(byId('599349078').multipackQuantity, 10);
  assert.equal(byId('590645301').multipackQuantity, null);

  // Elo máquina -> motor, que o balcão percorria à mão no site.
  assert.equal(byId('598693901').engine?.model, 'HS608');
  assert.equal(byId('598693901').engine?.brand, 'HUSQVARNA');
  assert.equal(byId('598693901').engine?.hasSeparateIpl, true);
  // Husqvarna não tem busca de manual de terceiro: sem link inventado.
  assert.equal(byId('598693901').engine?.manualUrl, null);

  // Briggs dá modelo E artigo, e aí o link do manual existe de verdade.
  const briggs = byId('587333501').engine!;
  assert.equal(briggs.brand, 'BRIGGS');
  assert.equal(briggs.model, '31R577-0027-B1');
  assert.equal(briggs.article, '587333501');
  assert.equal(briggs.manualUrl, 'https://www.briggsandstratton.com/pt-br/support/manuals/results?search=31R577-0027-B1');

  // Peça sem declaração de motor não ganha objeto de motor.
  assert.equal(byId('590645301').engine, null);
  assert.equal(byId('599349078').engine, null);
});

test('Kawasaki: o portal manda ler a plaqueta, e é isso que a tela recebe', () => {
  const payload = {
    site: {
      articles: {
        byIds: [{
          id: '967984802',
          name: { productName: 'Cortador Giro Zero Husqvarna Z460' },
          product: { category: { name: 'Cortadores de grama giro zero' } },
          ipls: [{
            id: 'HVA_PL-Z460-PLACA',
            name: 'PLACA DO MOTOR',
            referenceWidth: 900,
            referenceHeight: 620,
            articles: [
              { id: '900000002', number: 1, name: 'DUMMY PART', comment: 'Kawasaki - See Engine Model & Spec.' },
            ],
          }],
        }],
      },
    },
  };

  const result = parseOfficialProductDetails(payload, '967984802');
  const motor = result!.iplSections[0].parts[0].engine!;
  assert.equal(motor.brand, 'KAWASAKI');
  assert.equal(motor.model, null, 'o portal não informa o modelo Kawasaki');
  assert.equal(motor.modelOnPlate, true, 'a tela precisa pedir a plaqueta');
  // Sem modelo, o link cai no localizador — nunca num endereço que abre vazio.
  assert.equal(motor.manualUrl, 'https://kawasakienginesusa.com/parts-lookup?aribrand=kwe');
});
