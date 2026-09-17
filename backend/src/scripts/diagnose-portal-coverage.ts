import { writeFileSync } from 'node:fs';
import { normalizeIdentifier } from '../utils/normalize';
import { HusqvarnaOfficialDetailService } from '../services/husqvarna-official-detail.service';
import { HusqvarnaProductSearchService } from '../services/husqvarna-product-search.service';

const MODELS = ['323R', 'P12597', 'LT151', '343R', '241R', '235R', '445E', '225R'];

function portalResultMatchesModel(title: string, model: string): boolean {
  const titleKey = normalizeIdentifier(title);
  const modelKey = normalizeIdentifier(model);
  return Boolean(modelKey && (titleKey.includes(modelKey) || modelKey.includes(titleKey.replace(/^HUSQVARNA/, ''))));
}

async function inspectModel(model: string) {
  const startedAt = Date.now();
  try {
    const results = await HusqvarnaProductSearchService.search(model);
    const productHits = results
      .filter(result => result.kind === 'PRODUCT' && result.pnc)
      .map(result => ({
        title: result.title,
        pnc: result.pnc!,
        portalUrl: result.portalUrl,
        discontinued: result.discontinued,
        matchesModel: portalResultMatchesModel(result.title, model),
      }));

    const candidates = productHits.filter(hit => hit.matchesModel).slice(0, 4);
    const checkedCandidates: Array<{
      title: string;
      pnc: string;
      portalUrl: string | null;
      discontinued: boolean;
      detailsResolved: boolean;
      productName: string | null;
      iplSectionCount: number;
      iplPartCount: number;
    }> = [];

    for (const candidate of candidates) {
      try {
        const details = await HusqvarnaOfficialDetailService.getProductDetails(candidate.pnc);
        checkedCandidates.push({
          ...candidate,
          detailsResolved: Boolean(details),
          productName: details?.productName || null,
          iplSectionCount: details?.iplSections.length || 0,
          iplPartCount: details?.iplSections.reduce((sum, section) => sum + section.parts.length, 0) || 0,
        });
      } catch {
        checkedCandidates.push({
          ...candidate,
          detailsResolved: false,
          productName: null,
          iplSectionCount: 0,
          iplPartCount: 0,
        });
      }
    }

    const positive = checkedCandidates.find(candidate => candidate.iplPartCount > 0);
    return {
      model,
      decision: positive ? 'PORTAL_IPL' : 'UNVERIFIED',
      verifiedPnc: positive?.pnc || null,
      verifiedPortalUrl: positive?.portalUrl || null,
      searchResultCount: results.length,
      productHitCount: productHits.length,
      matchingProductCount: candidates.length,
      productHits,
      checkedCandidates,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      model,
      decision: 'UNVERIFIED',
      verifiedPnc: null,
      verifiedPortalUrl: null,
      searchResultCount: 0,
      productHitCount: 0,
      matchingProductCount: 0,
      productHits: [],
      checkedCandidates: [],
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - startedAt,
    };
  }
}

async function main() {
  const rows = [];
  for (const model of MODELS) {
    rows.push(await inspectModel(model));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    rule: 'PORTAL_IPL somente quando há produto compatível, PNC e IPL com ao menos uma peça; todo o restante permanece UNVERIFIED.',
    models: rows,
  };

  writeFileSync('portal-homologation.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
