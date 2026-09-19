import { Response } from 'express';
import { LRUCache } from 'lru-cache';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier } from '../utils/normalize';
import { allRelatedPartNumbers, preferCurrentPartNumbers } from '../services/part-supersession';
import { findCompanions, hasCompanionRule } from '../services/part-companions';
import {
  classifyPartKind,
  findEngineApplications,
  findMachinesForEngine,
} from '../services/husqvarna-domain-knowledge';

const PART_DETAIL_CACHE_TTL_MS = Math.max(
  15_000,
  Number(process.env.PART_DETAIL_CACHE_TTL_MS || '45000') || 45_000,
);

type PartResponse = { part: Record<string, unknown> };

const detailResponseCache = new LRUCache<string, PartResponse>({
  max: 1500,
  ttl: PART_DETAIL_CACHE_TTL_MS,
});

export function invalidatePartDetailResponseCache(tenantId?: string, partId?: string): void {
  if (!tenantId) {
    detailResponseCache.clear();
    return;
  }

  for (const key of detailResponseCache.keys()) {
    if (!key.startsWith(`${tenantId}:`)) continue;
    if (!partId || key.endsWith(`:${partId}`)) detailResponseCache.delete(key);
  }
}

export class PartDetailController {
  async get(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const id = String(req.params.id);
    const { tenantId, id: userId } = req.user;
    const cacheKey = `${tenantId}:${userId}:${id}`;
    const cached = detailResponseCache.get(cacheKey);
    if (cached) {
      res.set('X-CogniVault-Cache', 'HIT');
      // O payload inclui estado pessoal de favorito. Reutilizamos apenas o LRU
      // do servidor; o navegador precisa revalidar a sessão em toda leitura.
      res.set('Cache-Control', 'private, no-store');
      res.json(cached);
      return;
    }

    try {
      // Primeira ida ao banco resolve a peça, o catálogo e o favorito do usuário.
      const row = await prisma.part.findFirst({
        where: {
          id,
          active: true,
          document: { tenantId, archivedAt: null, status: 'COMPLETED' },
        },
        include: {
          document: {
            select: { id: true, filename: true, manufacturer: true, model: true, pnc: true },
          },
          favorites: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
        },
      });

      if (!row) {
        res.status(404).json({ error: 'Peça não encontrada.' });
        return;
      }

      const { favorites, ...part } = row;
      const [resolvedPart] = preferCurrentPartNumbers([part]);
      const relatedCodes = allRelatedPartNumbers(part.normalizedPartNumber)
        .map(normalizeIdentifier)
        .filter(Boolean);
      const compatibilityCodes = relatedCodes.length ? relatedCodes : [part.normalizedPartNumber];
      // Só vale ir ao banco se a peça tem regra de acompanhante.
      const temAcompanhantes = hasCompanionRule(resolvedPart.name);

      // Depois de conhecermos a peça, todo o enriquecimento independente roda em paralelo.
      const [related, compatibility, masterPart, candidateParts] = await Promise.all([
        prisma.part.findMany({
          where: {
            id: { not: part.id },
            normalizedModel: part.normalizedModel,
            active: true,
            document: { tenantId, archivedAt: null, status: 'COMPLETED' },
            ...(part.section ? { section: part.section } : {}),
          },
          take: 8,
          select: {
            id: true,
            name: true,
            partNumber: true,
            model: true,
            pnc: true,
            section: true,
            position: true,
            page: true,
          },
        }),
        prisma.part.findMany({
          where: {
            normalizedPartNumber: { in: compatibilityCodes },
            active: true,
            document: { tenantId, archivedAt: null, status: 'COMPLETED' },
          },
          distinct: ['normalizedModel', 'normalizedPnc'],
          take: 50,
          select: { model: true, pnc: true, universalAcrossPnc: true },
        }),
        prisma.masterPart.findUnique({
          where: {
            tenantId_normalizedNumber: {
              tenantId,
              normalizedNumber: resolvedPart.normalizedPartNumber,
            },
          },
        }),
        // Traz o catálogo da máquina e deixa `findCompanions` escolher. A
        // versão anterior filtrava aqui por termo largo ("junta") e por isso
        // devolvia toda junta da máquina — era daí que saía
        // JUNTA/JUNTA/JUNTA/FIVELA na tela. O teto de 300 cabe num catálogo de
        // máquina inteiro e continua sendo uma consulta indexada por documento.
        temAcompanhantes
          ? prisma.part.findMany({
              where: {
                documentId: resolvedPart.documentId,
                active: true,
                id: { not: resolvedPart.id },
              },
              take: 300,
              select: {
                id: true,
                name: true,
                partNumber: true,
                model: true,
                pnc: true,
                section: true,
                position: true,
                page: true,
              },
            })
          : Promise.resolve([]),
      ]);

      const extraCompatibility: Array<{ model: string; pnc: string }> = [];
      for (const app of findMachinesForEngine(part.normalizedModel)) {
        extraCompatibility.push({
          model: `${app.machineModel} (Giro Zero / Trator c/ motor ${part.model})`,
          pnc: app.machinePnc || 'Chassi',
        });
      }
      for (const app of findEngineApplications(part.normalizedModel)) {
        extraCompatibility.push({
          model: `Motor ${app.engineModel} (Equipamento original)`,
          pnc: app.engineArticle ? `Artigo ${app.engineArticle}` : 'Motor',
        });
      }

      // Acompanhantes de verdade: substantivo principal E qualificador, lidos
      // só da descrição. Sem candidato específico, a seção não aparece —
      // preferir silêncio a uma junta qualquer. Ver services/part-companions.ts.
      const encontrados = findCompanions(resolvedPart.name, candidateParts);
      const suggestedAddons = {
        reason: encontrados.reason,
        items: encontrados.items.map(item => ({
          ...item,
          classification: classifyPartKind(item.name, item.section),
        })),
      };

      const payload: PartResponse = {
        part: {
          ...resolvedPart,
          price: masterPart?.price ?? null,
          ean: masterPart?.ean ?? null,
          ncm: masterPart?.ncm ?? null,
          officialName: masterPart?.name ?? null,
          masterCategory: masterPart?.category ?? null,
          brand: masterPart?.brand ?? null,
          pnc: resolvedPart.universalAcrossPnc ? 'Qualquer um' : resolvedPart.pnc,
          classification: classifyPartKind(resolvedPart.name, resolvedPart.section, resolvedPart.notes),
          suggestedAddons,
          related: related.map(candidate => ({
            ...candidate,
            classification: classifyPartKind(candidate.name, candidate.section),
          })),
          compatibility: [
            ...compatibility.map(item => ({
              model: item.model,
              pnc: item.universalAcrossPnc ? 'Qualquer um' : item.pnc,
            })),
            ...extraCompatibility,
          ],
          favoriteId: favorites[0]?.id || null,
        },
      };

      detailResponseCache.set(cacheKey, payload);
      res.set('X-CogniVault-Cache', 'MISS');
      res.set('Cache-Control', 'private, no-store');
      res.json(payload);
    } catch (error) {
      console.error(`❌ Erro ao buscar detalhe da peça ${id}:`, error);
      res.status(500).json({ error: 'Erro ao carregar detalhes da peça.' });
    }
  }
}
