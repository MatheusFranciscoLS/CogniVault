import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { looksLikeDescriptionModel } from './catalog-extractor';

type RepairResult = {
  changed: boolean;
  model?: string;
  manufacturer?: string;
  pnc?: string;
};

function dominant(values: Array<string | null | undefined>): { value: string; ratio: number } | null {
  const counts = new Map<string, { label: string; count: number }>();
  let total = 0;
  for (const raw of values) {
    const label = (raw || '').trim();
    if (!label) continue;
    const key = normalizeIdentifier(label);
    if (!key) continue;
    const current = counts.get(key) || { label, count: 0 };
    current.count += 1;
    counts.set(key, current);
    total += 1;
  }
  if (!total || !counts.size) return null;
  const winner = [...counts.values()].sort((left, right) => right.count - left.count)[0];
  return { value: winner.label, ratio: winner.count / total };
}

/**
 * Corrige somente metadados claramente automáticos/suspeitos usando consenso das
 * próprias Part rows recém-extraídas. Nunca altera código de peça e nunca
 * sobrescreve metadados que já foram revisados manualmente pelo administrador.
 */
export async function repairAutoDetectedDocumentMetadata(documentId: string, tenantId: string): Promise<RepairResult> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, tenantId, archivedAt: null },
    select: {
      id: true,
      manufacturer: true,
      model: true,
      pnc: true,
      metadataReviewedAt: true,
      parts: {
        where: { active: true },
        select: { manufacturer: true, model: true, pnc: true, universalAcrossPnc: true },
      },
    },
  });
  if (!document || document.metadataReviewedAt || !document.parts.length) return { changed: false };

  const data: { manufacturer?: string; model?: string; pnc?: string } = {};
  const modelConsensus = dominant(document.parts.map(part => part.model));
  const currentModel = (document.model || '').trim();
  if (
    modelConsensus
    && modelConsensus.ratio >= 0.8
    && (!currentModel || looksLikeDescriptionModel(currentModel))
    && normalizeIdentifier(currentModel) !== normalizeIdentifier(modelConsensus.value)
  ) {
    data.model = modelConsensus.value;
  }

  const manufacturerConsensus = dominant(document.parts.map(part => part.manufacturer));
  if (!document.manufacturer?.trim() && manufacturerConsensus?.ratio === 1) {
    data.manufacturer = manufacturerConsensus.value;
  }

  if (!document.pnc?.trim()) {
    const pncs = [...new Set(document.parts
      .filter(part => !part.universalAcrossPnc)
      .map(part => (part.pnc || '').trim())
      .filter(Boolean))];
    if (pncs.length === 1) data.pnc = pncs[0];
  }

  if (!Object.keys(data).length) return { changed: false };
  await prisma.document.update({ where: { id: document.id }, data });
  return { changed: true, ...data };
}
