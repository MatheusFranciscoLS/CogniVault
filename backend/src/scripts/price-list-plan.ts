// Plano de gravação da lista em .html: o que vira linha no banco. Função pura,
// testável sem banco. O importador só executa o que este plano devolve.
import { normalizeIdentifier } from '../utils/normalize';
import type { HtmlPriceItem, PriceListSection } from './price-list-html';
import { commercialPrice } from './price-list-rules';

export const HTML_IMPORT_SOURCE = 'LISTA_HTML';

/**
 * Os nomes de categoria reaproveitam os que a planilha antiga já criou, para o
 * filtro da busca continuar com uma lista só. "ACESSÓRIOS" e "LUBRIFICANTES"
 * não existiam na planilha e são novos.
 */
export function sectionLabelFor(
  list: PriceListSection,
  technology: string | null,
  productCategory: string | null,
): string {
  if (list === 'acessorios') return 'ACESSÓRIOS';
  if (list === 'lubrificantes') return 'LUBRIFICANTES';
  if (list === 'ferramentas') return 'FERRAMENTAS';
  if (technology === 'BATERIA') return 'PEÇAS PARA PRODUTOS A BATERIA';
  if (technology === 'ROBÔ') return 'PEÇAS PARA CORTADORES DE GRAMA AUTOMOWER';
  if (productCategory === 'GIRO ZERO') return 'PEÇAS PARA CORTADORES DE GRAMA GIRO ZERO';
  return 'PEÇAS DE REPOSIÇÃO GERAL';
}

export type NewMasterRecord = {
  partNumber: string;
  normalizedNumber: string;
  name: string;
  price: number;
  ncm: string | null;
  ean: string | null;
  category: string;
  brand: string;
};

export type NewSectionRecord = {
  normalizedNumber: string;
  section: string;
  application: string | null;
  applicationKey: string;
  reference: string;
  productCategory: string | null;
  sourceSheet: string;
};

export function buildNewRecords(items: HtmlPriceItem[]): {
  masters: NewMasterRecord[];
  sections: NewSectionRecord[];
} {
  const masters: NewMasterRecord[] = [];
  const sections = new Map<string, NewSectionRecord>();

  for (const item of items) {
    const price = commercialPrice(item.consumerPrice);
    if (price === null) continue;

    const first = item.applications[0];
    masters.push({
      partNumber: item.partNumber,
      normalizedNumber: item.normalizedNumber,
      name: item.name,
      price,
      ncm: item.ncm,
      ean: item.ean,
      category: sectionLabelFor(item.section, first?.technology ?? null, first?.productCategory ?? null),
      brand: 'HUSQVARNA',
    });

    for (const application of item.applications) {
      const section = sectionLabelFor(item.section, application.technology, application.productCategory);
      const applicationKey = normalizeIdentifier(application.application);
      // Mesma chave única do banco: (código, categoria, aplicação).
      const key = `${item.normalizedNumber}|${section}|${applicationKey}`;
      if (sections.has(key)) continue;
      sections.set(key, {
        normalizedNumber: item.normalizedNumber,
        section,
        application: application.application,
        applicationKey,
        reference: 'HUSQVARNA',
        productCategory: application.productCategory,
        sourceSheet: `${HTML_IMPORT_SOURCE}:${item.section}`,
      });
    }
  }

  return { masters, sections: [...sections.values()] };
}
