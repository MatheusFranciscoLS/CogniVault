import { OfficialVerificationStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { VERIFIED_PART_SUPERSESSIONS, getVerifiedSupersession } from './part-supersession';

export const HUSQVARNA_PARTS_BASE_URL = 'https://portal.husqvarnagroup.com/br/spare-parts/?part=';

export type PublicVerificationState = 'UNVERIFIED' | 'VERIFIED' | 'SUPERSEDED' | 'REVIEW';

export interface OfficialVerificationView {
  id: string | null;
  state: PublicVerificationState;
  queriedPartNumber: string;
  currentPartNumber: string;
  description: string | null;
  officialUrl: string;
  note: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  source: 'TENANT' | 'BUILT_IN' | 'NONE';
}

type VerificationRow = {
  id: string;
  status: OfficialVerificationStatus;
  queriedPartNumber: string;
  normalizedQueriedNumber: string;
  currentPartNumber: string;
  normalizedCurrentNumber: string;
  description: string | null;
  officialUrl: string;
  note: string | null;
  verifiedAt: Date;
  createdAt: Date;
  user: { email: string };
};

export function buildHusqvarnaPortalUrl(partNumber: string): string {
  const normalized = normalizeIdentifier(partNumber);
  if (!normalized) throw new Error('Código da peça inválido.');
  return `${HUSQVARNA_PARTS_BASE_URL}${encodeURIComponent(normalized)}`;
}

export function isAllowedHusqvarnaPortalUrl(url: string, currentPartNumber: string): boolean {
  return url === buildHusqvarnaPortalUrl(currentPartNumber);
}

function mapStatus(status: OfficialVerificationStatus): PublicVerificationState {
  if (status === 'SUPERSEDED') return 'SUPERSEDED';
  if (status === 'REVIEW') return 'REVIEW';
  return 'VERIFIED';
}

function rowToView(row: VerificationRow): OfficialVerificationView {
  return {
    id: row.id,
    state: mapStatus(row.status),
    queriedPartNumber: row.queriedPartNumber,
    currentPartNumber: row.currentPartNumber,
    description: row.description,
    officialUrl: row.officialUrl,
    note: row.note,
    verifiedAt: row.verifiedAt.toISOString(),
    verifiedBy: row.user.email,
    source: 'TENANT',
  };
}

function builtInViewForCode(partNumber: string): OfficialVerificationView | null {
  const normalized = normalizeIdentifier(partNumber);
  const builtIn = getVerifiedSupersession(partNumber)
    || VERIFIED_PART_SUPERSESSIONS.find(item => normalizeIdentifier(item.currentPartNumber) === normalized)
    || null;
  if (!builtIn) return null;

  return {
    id: null,
    state: 'SUPERSEDED',
    queriedPartNumber: builtIn.previousPartNumber,
    currentPartNumber: builtIn.currentPartNumber,
    description: null,
    officialUrl: builtIn.sourceUrl,
    note: 'Substituição oficial preservada da regra existente do CogniVault.',
    verifiedAt: builtIn.verifiedAt,
    verifiedBy: null,
    source: 'BUILT_IN',
  };
}

function unverifiedView(partNumber: string): OfficialVerificationView {
  return {
    id: null,
    state: 'UNVERIFIED',
    queriedPartNumber: partNumber,
    currentPartNumber: partNumber,
    description: null,
    officialUrl: buildHusqvarnaPortalUrl(partNumber),
    note: null,
    verifiedAt: null,
    verifiedBy: null,
    source: 'NONE',
  };
}

function latestRowsByQueriedNumber(rows: VerificationRow[]): VerificationRow[] {
  const seen = new Set<string>();
  return rows.filter(row => {
    if (seen.has(row.normalizedQueriedNumber)) return false;
    seen.add(row.normalizedQueriedNumber);
    return true;
  });
}

export class OfficialPartVerificationService {
  private static async tenantRowsForCodes(tenantId: string, normalizedCodes: string[]): Promise<VerificationRow[]> {
    if (!normalizedCodes.length) return [];
    return prisma.officialPartVerification.findMany({
      where: {
        tenantId,
        OR: [
          { normalizedQueriedNumber: { in: normalizedCodes } },
          { normalizedCurrentNumber: { in: normalizedCodes } },
        ],
      },
      orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'desc' }],
      include: { user: { select: { email: true } } },
      take: 1000,
    });
  }

  static async latestForCodes(tenantId: string, partNumbers: string[]): Promise<OfficialVerificationView[]> {
    const requested = partNumbers.map(partNumber => ({ partNumber, normalized: normalizeIdentifier(partNumber) }));
    const normalizedCodes = [...new Set(requested.map(item => item.normalized).filter(Boolean))];
    const rows = latestRowsByQueriedNumber(await this.tenantRowsForCodes(tenantId, normalizedCodes));

    const byQueried = new Map<string, VerificationRow>();
    const byCurrent = new Map<string, VerificationRow>();
    for (const row of rows) {
      if (!byQueried.has(row.normalizedQueriedNumber)) byQueried.set(row.normalizedQueriedNumber, row);
      if (!byCurrent.has(row.normalizedCurrentNumber)) byCurrent.set(row.normalizedCurrentNumber, row);
    }

    return requested.map(({ partNumber, normalized }) => {
      if (!normalized) throw new Error('Código da peça inválido.');
      const tenantRow = byQueried.get(normalized) || byCurrent.get(normalized);
      if (tenantRow) return rowToView(tenantRow);
      return builtInViewForCode(partNumber) || unverifiedView(partNumber);
    });
  }

  static async latestForCode(tenantId: string, partNumber: string): Promise<OfficialVerificationView> {
    return (await this.latestForCodes(tenantId, [partNumber]))[0];
  }

  static async resolveCurrentCode(tenantId: string, partNumber: string): Promise<OfficialVerificationView> {
    const normalized = normalizeIdentifier(partNumber);
    if (!normalized) throw new Error('Código da peça inválido.');

    const latest = await prisma.officialPartVerification.findFirst({
      where: { tenantId, normalizedQueriedNumber: normalized },
      orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'desc' }],
      include: { user: { select: { email: true } } },
    });

    if (latest) {
      const view = rowToView(latest);
      return view.state === 'SUPERSEDED' ? view : { ...view, currentPartNumber: partNumber };
    }

    const builtIn = getVerifiedSupersession(partNumber);
    if (builtIn) return builtInViewForCode(partNumber)!;
    return unverifiedView(partNumber);
  }

  static async history(tenantId: string, partNumber: string) {
    const normalized = normalizeIdentifier(partNumber);
    if (!normalized) return [];
    return prisma.officialPartVerification.findMany({
      where: {
        tenantId,
        OR: [
          { normalizedQueriedNumber: normalized },
          { normalizedCurrentNumber: normalized },
        ],
      },
      orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'desc' }],
      include: { user: { select: { email: true } } },
      take: 50,
    });
  }

  static async register(input: {
    tenantId: string;
    userId: string;
    status: OfficialVerificationStatus;
    queriedPartNumber: string;
    currentPartNumber: string;
    description?: string | null;
    officialUrl: string;
    note?: string | null;
    verifiedAt: Date;
  }) {
    const queriedPartNumber = input.queriedPartNumber.trim();
    const currentPartNumber = input.currentPartNumber.trim();
    const normalizedQueriedNumber = normalizeIdentifier(queriedPartNumber);
    const normalizedCurrentNumber = normalizeIdentifier(currentPartNumber);

    if (!normalizedQueriedNumber || !normalizedCurrentNumber) throw new Error('Informe códigos de peça válidos.');
    if (queriedPartNumber.length > 80 || currentPartNumber.length > 80) throw new Error('Código de peça muito longo.');
    if (!Number.isFinite(input.verifiedAt.getTime())) throw new Error('Data da verificação inválida.');
    if ((input.description?.length || 0) > 500) throw new Error('Descrição muito longa.');
    if ((input.note?.length || 0) > 2000) throw new Error('Observação muito longa.');
    if (!isAllowedHusqvarnaPortalUrl(input.officialUrl, currentPartNumber)) {
      throw new Error('A URL oficial deve apontar exatamente para o Portal Husqvarna público usando o código atual.');
    }
    if (input.status === 'SUPERSEDED' && normalizedQueriedNumber === normalizedCurrentNumber) {
      throw new Error('Uma substituição precisa ter código antigo e código atual diferentes.');
    }
    if (input.status === 'VERIFIED' && normalizedQueriedNumber !== normalizedCurrentNumber) {
      throw new Error('Use o estado Código substituído quando o código atual for diferente do código consultado.');
    }

    return prisma.$transaction(async tx => {
      const record = await tx.officialPartVerification.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          status: input.status,
          queriedPartNumber,
          normalizedQueriedNumber,
          currentPartNumber,
          normalizedCurrentNumber,
          description: input.description?.trim() || null,
          officialUrl: input.officialUrl,
          note: input.note?.trim() || null,
          verifiedAt: input.verifiedAt,
        },
        include: { user: { select: { email: true } } },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          action: 'OFFICIAL_PART_VERIFICATION_CREATED',
          targetType: 'OfficialPartVerification',
          targetId: record.id,
          metadata: {
            status: input.status,
            queriedPartNumber: record.queriedPartNumber,
            currentPartNumber: record.currentPartNumber,
            officialUrl: record.officialUrl,
            verifiedAt: record.verifiedAt.toISOString(),
          },
        },
      });

      return record;
    });
  }
}
