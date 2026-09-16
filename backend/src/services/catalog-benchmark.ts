import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import type { PartBenchmarkCase } from './part-benchmark';

const MAX_PORTFOLIO_BENCHMARK_CASES = 50_000;

type CatalogBenchmarkRow = {
  id: string;
  name: string;
  partNumber: string;
  normalizedPartNumber: string;
  model: string;
  normalizedModel: string;
  pnc: string | null;
  normalizedPnc: string | null;
  section: string | null;
  position: string | null;
  page: number | null;
  document: { filename: string; category: { name: string } | null };
};

function text(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function eligible(row: CatalogBenchmarkRow): boolean {
  const code = normalizeIdentifier(row.partNumber);
  return Boolean(
    text(row.name).length >= 3
    && text(row.model).length >= 2
    && /^\d{6,14}$/.test(code)
    && row.normalizedModel,
  );
}

function evidenceKey(row: CatalogBenchmarkRow): string {
  return [
    row.normalizedModel,
    row.normalizedPnc || '',
    text(row.section).toLocaleLowerCase('pt-BR'),
    text(row.position).toLocaleLowerCase('pt-BR'),
    text(row.name).toLocaleLowerCase('pt-BR'),
  ].join('|');
}

function variantFor(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 3;
}

function caseFromRow(row: CatalogBenchmarkRow): PartBenchmarkCase {
  const family = text(row.document.category?.name) || 'Sem categoria';
  const model = text(row.model);
  const pnc = text(row.pnc);
  const section = text(row.section);
  const position = text(row.position);
  const context = [
    pnc ? `PNC ${pnc}` : '',
    section ? `vista ${section}` : '',
    position ? `posição ${position}` : '',
  ].filter(Boolean).join(' · ');
  const suffix = context ? ` · ${context}` : '';
  const variant = variantFor(row.id);
  const query = variant === 0
    ? `qual o código de ${text(row.name)} do ${model}${suffix}`
    : variant === 1
      ? `preciso de ${text(row.name)} para ${model}${suffix}`
      : `catálogo ${model}: ${text(row.name)}${suffix}`;

  return {
    id: `catalog-${row.id}`,
    query,
    model,
    pnc: pnc || undefined,
    expectedPartNumbers: [normalizeIdentifier(row.partNumber)],
    source: `${row.document.filename}${row.page ? ` · pág. ${row.page}` : ''}${section ? ` · ${section}` : ''}${position ? ` · pos. ${position}` : ''}`,
    family,
    queryType: position && section ? 'POSITIONED_CATALOG' : pnc ? 'PNC_PART' : 'MODEL_PART',
  };
}

/**
 * Seleciona casos de catálogo de forma determinística e distribuída por família
 * e por modelo. Um modelo recebe uma nova vaga somente depois de os demais
 * modelos consultáveis da mesma família também terem tido oportunidade.
 *
 * Um caso só entra quando a combinação de evidência (modelo/PNC/vista/posição/nome)
 * aponta para um único Part Number. Assim o benchmark não cria uma resposta
 * artificial para uma consulta que o próprio catálogo considera ambígua.
 */
export function selectCatalogBenchmarkCases(rows: CatalogBenchmarkRow[], limit = 500): PartBenchmarkCase[] {
  const safeLimit = Math.max(1, Math.min(MAX_PORTFOLIO_BENCHMARK_CASES, Math.trunc(limit)));
  const byEvidence = new Map<string, CatalogBenchmarkRow[]>();
  for (const row of rows) {
    if (!eligible(row)) continue;
    const key = evidenceKey(row);
    const group = byEvidence.get(key) || [];
    group.push(row);
    byEvidence.set(key, group);
  }

  const uniqueRows = [...byEvidence.values()]
    .filter(group => new Set(group.map(row => normalizeIdentifier(row.partNumber))).size === 1)
    .map(group => group[0]);

  const families = new Map<string, Map<string, CatalogBenchmarkRow[]>>();
  for (const row of uniqueRows) {
    const family = text(row.document.category?.name) || 'Sem categoria';
    const models = families.get(family) || new Map<string, CatalogBenchmarkRow[]>();
    const modelRows = models.get(row.normalizedModel) || [];
    modelRows.push(row);
    models.set(row.normalizedModel, modelRows);
    families.set(family, models);
  }

  for (const models of families.values()) {
    for (const group of models.values()) {
      group.sort((a, b) => (
        text(a.section).localeCompare(text(b.section))
        || text(a.position).localeCompare(text(b.position))
        || a.normalizedPartNumber.localeCompare(b.normalizedPartNumber)
      ));
    }
  }

  const familyNames = [...families.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const modelNamesByFamily = new Map(
    familyNames.map(family => [family, [...(families.get(family)?.keys() || [])].sort((a, b) => a.localeCompare(b, 'pt-BR'))]),
  );
  const nextModelIndex = new Map(familyNames.map(family => [family, 0]));
  const offsetsByModel = new Map<string, number>();
  const selected: CatalogBenchmarkRow[] = [];
  const selectedCodesByModel = new Set<string>();

  while (selected.length < safeLimit) {
    let progressed = false;

    for (const family of familyNames) {
      const models = families.get(family);
      const modelNames = modelNamesByFamily.get(family) || [];
      if (!models || !modelNames.length) continue;

      let cursor = nextModelIndex.get(family) || 0;
      let selectedFromFamily = false;

      for (let attempt = 0; attempt < modelNames.length; attempt += 1) {
        const model = modelNames[cursor % modelNames.length];
        cursor = (cursor + 1) % modelNames.length;
        const modelRows = models.get(model) || [];
        const offsetKey = `${family}|${model}`;
        let offset = offsetsByModel.get(offsetKey) || 0;

        while (offset < modelRows.length) {
          const candidate = modelRows[offset++];
          const diversityKey = `${candidate.normalizedModel}|${candidate.normalizedPartNumber}`;
          if (selectedCodesByModel.has(diversityKey)) continue;
          selected.push(candidate);
          selectedCodesByModel.add(diversityKey);
          progressed = true;
          selectedFromFamily = true;
          break;
        }

        offsetsByModel.set(offsetKey, offset);
        if (selectedFromFamily) break;
      }

      nextModelIndex.set(family, cursor);
      if (selected.length >= safeLimit) break;
    }

    if (!progressed) break;
  }

  return selected.map(caseFromRow);
}

export async function buildCatalogBenchmarkCases(tenantId: string, limit = 500): Promise<PartBenchmarkCase[]> {
  const rows = await prisma.part.findMany({
    where: {
      active: true,
      document: {
        tenantId,
        archivedAt: null,
        status: 'COMPLETED',
        processingStage: { not: 'REMOVED' },
      },
    },
    orderBy: [{ normalizedModel: 'asc' }, { normalizedPartNumber: 'asc' }],
    take: 50_000,
    select: {
      id: true,
      name: true,
      partNumber: true,
      normalizedPartNumber: true,
      model: true,
      normalizedModel: true,
      pnc: true,
      normalizedPnc: true,
      section: true,
      position: true,
      page: true,
      document: { select: { filename: true, category: { select: { name: true } } } },
    },
  });
  return selectCatalogBenchmarkCases(rows, limit);
}

export function benchmarkCoverageByFamily(cases: PartBenchmarkCase[]) {
  const counts = new Map<string, number>();
  for (const item of cases) {
    const family = item.family || 'Curado manualmente';
    counts.set(family, (counts.get(family) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([family, count]) => ({ family, count }))
    .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family, 'pt-BR'));
}

export function benchmarkCoverageByModel(cases: PartBenchmarkCase[]) {
  const counts = new Map<string, number>();
  for (const item of cases) {
    const model = text(item.model) || 'Sem modelo';
    counts.set(model, (counts.get(model) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model, 'pt-BR'));
}
