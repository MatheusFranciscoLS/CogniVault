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
  filename?: string | null;
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

function explicitEngineManufacturer(filename: string | null | undefined): string | null {
  const value = (filename || '').trim();
  if (/\bKawasaki\b/i.test(value)) return 'Kawasaki';
  if (/\bBriggs\b/i.test(value)) return 'Briggs & Stratton';
  if (/\bKohler\b/i.test(value)) return 'Kohler';
  if (/\bHonda\b/i.test(value)) return 'Honda';
  return null;
}

/**
 * Política pura de reparo. O nome do arquivo pode ser uma evidência explícita
 * para catálogos de motor (ex.: "Motor Kawasaki FX921.pdf"). Fora desse caso,
 * só alteramos metadado vazio ou claramente parecido com descrição de peça.
 * Um valor revisado pelo administrador nunca é sobrescrito automaticamente.
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

  const filenameManufacturer = explicitEngineManufacturer(input.filename);
  const manufacturerConsensus = dominant(input.parts.map(part => part.manufacturer));
  if (
    filenameManufacturer
    && normalizeIdentifier(input.manufacturer) !== normalizeIdentifier(filenameManufacturer)
  ) {
    data.manufacturer = filenameManufacturer;
  } else if (!input.manufacturer?.trim() && manufacturerConsensus?.ratio === 1) {
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
 * Corrige somente metadados claramente automáticos/suspeitos. Se o fabricante
 * explícito do motor for reparado, sincronizamos também as Part rows ativas para
 * que busca e filtros não fiquem com metadado divergente do documento.
 */
export async function repairAutoDetectedDocumentMetadata(documentId: string, tenantId: string): Promise<RepairResult> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, tenantId, archivedAt: null },
    select: {
      id: true,
      filename: true,
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

  await prisma.$transaction(async tx => {
    await tx.document.update({ where: { id: document.id }, data });
    if (suggestion.manufacturer) {
      await tx.part.updateMany({
        where: { documentId: document.id, active: true },
        data: {
          manufacturer: suggestion.manufacturer,
          normalizedManufacturer: normalizeIdentifier(suggestion.manufacturer),
        },
      });
    }
  });
  return suggestion;
}
