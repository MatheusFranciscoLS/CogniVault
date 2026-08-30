import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { looksLikeDescriptionModel } from './catalog-extractor';

export type RepairResult = {
  changed: boolean;
  model?: string;
  manufacturer?: string;
  pnc?: string;
};

export type AutoMetadataPart = {
  manufacturer?: string | null;
  model?: string | null;
  pnc?: string | null;
  universalAcrossPnc?: boolean;
};

export type AutoMetadataInput = {
  manufacturer?: string | null;
  model?: string | null;
  pnc?: string | null;
  metadataReviewedAt?: Date | string | null;
  parts: AutoMetadataPart[];
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
 * Política pura de reparo. Só sugere alteração quando o metadado atual está
 * vazio ou claramente parece descrição de peça/conjunto. Um valor revisado pelo
 * administrador nunca é sobrescrito automaticamente.
 */
export function suggestAutoMetadataRepair(input: AutoMetadataInput): RepairResult {
  if (input.metadataReviewedAt || !input.parts.length) return { changed: false };
  const data: Omit<RepairResult, 'changed'> = {};

  const modelConsensus = dominant(input.parts.map(part => part.model));
  const currentModel = (input.model || '').trim();
  if (
    modelConsensus
    && modelConsensus.ratio >= 0.8
    && (!currentModel || looksLikeDescriptionModel(currentModel))
    && normalizeIdentifier(currentModel) !== normalizeIdentifier(modelConsensus.value)
  ) {
    data.model = modelConsensus.value;
  }

  const manufacturerConsensus = dominant(input.parts.map(part => part.manufacturer));
  if (!input.manufacturer?.trim() && manufacturerConsensus?.ratio === 1) {
    data.manufacturer = manufacturerConsensus.value;
  }

  if (!input.pnc?.trim()) {
    const pncs = [...new Set(input.parts
      .filter(part => !part.universalAcrossPnc)
      .map(part => (part.pnc || '').trim())
      .filter(Boolean))];
    if (pncs.length === 1) data.pnc = pncs[0];
  }

  return Object.keys(data).length ? { changed: true, ...data } : { changed: false };
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
  if (!document) return { changed: false };

  const suggestion = suggestAutoMetadataRepair(document);
  if (!suggestion.changed) return suggestion;
  const { changed: _changed, ...data } = suggestion;
  await prisma.document.update({ where: { id: document.id }, data });
  return suggestion;
}
