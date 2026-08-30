import fs from 'node:fs';
import { PDFParse } from 'pdf-parse';
import { parseHusqvarnaIplText, type CatalogHints, type DeterministicExtraction } from './catalog-extractor';
import { parseLegacyRefCatalog } from './catalog-legacy-ref-parser';
import { detectTrustedCatalogModel } from './catalog-model-detection';

/**
 * Camada V4 sobre o parser existente. Ela usa a evidência do documento inteiro
 * para fixar o modelo do produto e acrescenta suporte aos IPLs antigos REF/PART
 * NO. sem forçar todos os formatos para a mesma regex.
 */
export async function extractCatalogDeterministicallyV4(
  filePath: string,
  hints: CatalogHints = {},
): Promise<DeterministicExtraction | null> {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const result = await parser.getText();
    const trustedModel = detectTrustedCatalogModel(result.text, hints);
    const extraction = parseLegacyRefCatalog(result.text, hints)
      || parseHusqvarnaIplText(result.text, hints);
    if (!extraction) return null;

    if (trustedModel) {
      extraction.models = [trustedModel];
      extraction.parts = extraction.parts.map(part => ({ ...part, model: trustedModel }));
    }
    return { extraction, method: 'HUSQVARNA_IPL_TEXT' };
  } finally {
    await parser.destroy();
  }
}
