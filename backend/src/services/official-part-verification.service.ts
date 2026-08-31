import { OfficialVerificationApprovalStatus, OfficialVerificationStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { VERIFIED_PART_SUPERSESSIONS, getVerifiedSupersession } from './part-supersession';

export const HUSQVARNA_PARTS_BASE_URL = 'https://portal.husqvarnagroup.com/br/spare-parts/?part=';

export type PublicVerificationState = 'UNVERIFIED' | 'VERIFIED' | 'SUPERSEDED' | 'REVIEW';
export type VerificationDecision = 'APPROVE' | 'REJECT';

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
  cacheState: 'FRESH' | 'STALE' | 'NONE';
  freshUntil: string | null;
}

export interface OfficialVerificationSubmissionView {
  id: string;
  status: OfficialVerificationStatus;
  approvalStatus: OfficialVerificationApprovalStatus;
  queriedPartNumber: string;
  currentPartNumber: string;
  description: string | null;
  officialUrl: string;
  note: string | null;
  verifiedAt: string;
  createdAt: string;
  submittedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

type VerificationRow = {
  id: string;
  status: OfficialVerificationStatus;
  approvalStatus: OfficialVerificationApprovalStatus;
  queriedPartNumber: string;
  normalizedQueriedNumber: string;
  currentPartNumber: string;
  normalizedCurrentNumber: string;
  description: string | null;
  officialUrl: string;
  note: string | null;
  verifiedAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  user: { email: string };
  reviewedBy: { email: string } | null;
};

export function buildHusqvarnaPortalUrl(partNumber: string): string {
  const normalized = normalizeIdentifier(partNumber);
  if (!normalized) throw new Error('Código da peça inválido.');
  return `${HUSQVARNA_PARTS_BASE_URL}${encodeURIComponent(normalized)}`;
}

export function isAllowedHusqvarnaPortalUrl(url: string, currentPartNumber: string): boolean {
  return url === buildHusqvarnaPortalUrl(currentPartNumber);
}

export function deriveOfficialVerificationStatus(
  queriedPartNumber: string,
  currentPartNumber: string,
): OfficialVerificationStatus {
  const queried = normalizeIdentifier(queriedPartNumber);
  const current = normalizeIdentifier(currentPartNumber);
  if (!queried || !current) throw new Error('Informe códigos de peça válidos.');
  return queried === current ? 'VERIFIED' : 'SUPERSEDED';
}

function mapStatus(status: OfficialVerificationStatus): PublicVerificationState {
  if (status === 'SUPERSEDED') return 'SUPERSEDED';
  if (status === 'REVIEW') return 'REVIEW';
  return 'VERIFIED';
}

export function officialVerificationCacheDays(): number {
  const configured = Number(process.env.OFFICIAL_VERIFICATION_CACHE_DAYS || '90');
  return Number.isFinite(configured) ? Math.min(365, Math.max(7, Math.trunc(configured))) : 90;
}

export function officialVerificationFreshUntil(verifiedAt: Date): Date {
  return new Date(verifiedAt.getTime() + officialVerificationCacheDays() * 24 * 60 * 60 * 1000);
}

function rowToView(row: VerificationRow): OfficialVerificationView {
  const freshUntil = officialVerificationFreshUntil(row.verifiedAt);
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
    cacheState: freshUntil.getTime() >= Date.now() ? 'FRESH' : 'STALE',
    freshUntil: freshUntil.toISOString(),
  };
}

function rowToSubmissionView(row: VerificationRow): OfficialVerificationSubmissionView {
  return {
    id: row.id,
    status: row.status,
    approvalStatus: row.approvalStatus,
    queriedPartNumber: row.queriedPartNumber,
    currentPartNumber: row.currentPartNumber,
    description: row.description,
    officialUrl: row.officialUrl,
    note: row.note,
    verifiedAt: row.verifiedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    submittedBy: row.user.email,
    reviewedBy: row.reviewedBy?.email || null,
    reviewedAt: row.reviewedAt?.toISOString() || null,
    reviewNote: row.reviewNote,
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
    cacheState: 'FRESH',
    freshUntil: null,
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
    cacheState: 'NONE',
    freshUntil: null,
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

const rowInclude = {
  user: { select: { email: true } },
  reviewedBy: { select: { email: true } },
} as const;

export class OfficialPartVerificationService {
  private static async tenantRowsForCodes(tenantId: string, normalizedCodes: string[]): Promise<VerificationRow[]> {
    if (!normalizedCodes.length) return [];
    return prisma.officialPartVerification.findMany({
      where: {
        tenantId,
        approvalStatus: 'APPROVED',
        OR: [
          { normalizedQueriedNumber: { in: normalizedCodes } },
          { normalizedCurrentNumber: { in: normalizedCodes } },
        ],
      },
      orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'desc' }],
      include: rowInclude,
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
      where: {
        tenantId,
        normalizedQueriedNumber: normalized,
        approvalStatus: 'APPROVED',
      },
      orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'desc' }],
      include: rowInclude,
    });

    if (latest) {
      const view = rowToView(latest);
      if (view.cacheState === 'STALE') {
        return {
          ...view,
          state: 'REVIEW',
          currentPartNumber: partNumber,
          note: 'A aprovação anterior venceu e precisa de nova conferência humana no Portal Husqvarna.',
        };
      }
      return view.state === 'SUPERSEDED' ? view : { ...view, currentPartNumber: partNumber };
    }

    const builtIn = getVerifiedSupersession(partNumber);
    if (builtIn) return builtInViewForCode(partNumber)!;
    return unverifiedView(partNumber);
  }

  static async history(tenantId: string, partNumber: string): Promise<OfficialVerificationSubmissionView[]> {
    const normalized = normalizeIdentifier(partNumber);
    if (!normalized) return [];
    const rows = await prisma.officialPartVerification.findMany({
      where: {
        tenantId,
        OR: [
          { normalizedQueriedNumber: normalized },
          { normalizedCurrentNumber: normalized },
        ],
      },
      orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'desc' }],
      include: rowInclude,
      take: 50,
    });
    return rows.map(rowToSubmissionView);
  }

  static async pending(tenantId: string): Promise<OfficialVerificationSubmissionView[]> {
    const rows = await prisma.officialPartVerification.findMany({
      where: { tenantId, approvalStatus: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: rowInclude,
      take: 100,
    });
    return rows.map(rowToSubmissionView);
  }

  static async submit(input: {
    tenantId: string;
    userId: string;
    queriedPartNumber: string;
    currentPartNumber: string;
    description?: string | null;
    note?: string | null;
  }): Promise<OfficialVerificationSubmissionView> {
    const queriedPartNumber = input.queriedPartNumber.trim();
    const currentPartNumber = input.currentPartNumber.trim();
    const normalizedQueriedNumber = normalizeIdentifier(queriedPartNumber);
    const normalizedCurrentNumber = normalizeIdentifier(currentPartNumber);
    const status = deriveOfficialVerificationStatus(queriedPartNumber, currentPartNumber);

    if (!normalizedQueriedNumber || !normalizedCurrentNumber) throw new Error('Informe códigos de peça válidos.');
    if (queriedPartNumber.length > 80 || currentPartNumber.length > 80) throw new Error('Código de peça muito longo.');
    if ((input.description?.length || 0) > 500) throw new Error('Descrição muito longa.');
    if ((input.note?.length || 0) > 2000) throw new Error('Observação muito longa.');

    const existingPending = await prisma.officialPartVerification.findFirst({
      where: {
        tenantId: input.tenantId,
        approvalStatus: 'PENDING',
        normalizedQueriedNumber,
        normalizedCurrentNumber,
      },
      select: { id: true },
    });
    if (existingPending) throw new Error('VERIFICATION_ALREADY_PENDING');

    const existingFresh = await prisma.officialPartVerification.findFirst({
      where: {
        tenantId: input.tenantId,
        approvalStatus: 'APPROVED',
        normalizedQueriedNumber,
        normalizedCurrentNumber,
        verifiedAt: { gte: new Date(Date.now() - officialVerificationCacheDays() * 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (existingFresh) throw new Error('VERIFICATION_ALREADY_FRESH');

    const verifiedAt = new Date();
    const officialUrl = buildHusqvarnaPortalUrl(currentPartNumber);
    const record = await prisma.$transaction(async tx => {
      const created = await tx.officialPartVerification.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          status,
          approvalStatus: 'PENDING',
          queriedPartNumber,
          normalizedQueriedNumber,
          currentPartNumber,
          normalizedCurrentNumber,
          description: input.description?.trim() || null,
          officialUrl,
          note: input.note?.trim() || null,
          verifiedAt,
        },
        include: rowInclude,
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          action: 'OFFICIAL_PART_VERIFICATION_SUBMITTED',
          targetType: 'OfficialPartVerification',
          targetId: created.id,
          metadata: {
            status,
            approvalStatus: 'PENDING',
            queriedPartNumber: created.queriedPartNumber,
            currentPartNumber: created.currentPartNumber,
            officialUrl: created.officialUrl,
            verifiedAt: created.verifiedAt.toISOString(),
          },
        },
      });
      return created;
    });

    return rowToSubmissionView(record);
  }

  static async decide(input: {
    tenantId: string;
    userId: string;
    verificationId: string;
    decision: VerificationDecision;
    reviewNote?: string | null;
  }): Promise<OfficialVerificationSubmissionView> {
    if (!input.verificationId.trim()) throw new Error('VERIFICATION_NOT_FOUND');
    if ((input.reviewNote?.length || 0) > 1000) throw new Error('Observação da revisão muito longa.');
    const approvalStatus: OfficialVerificationApprovalStatus = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const reviewedAt = new Date();

    const record = await prisma.$transaction(async tx => {
      const existing = await tx.officialPartVerification.findFirst({
        where: { id: input.verificationId, tenantId: input.tenantId },
        select: { id: true, approvalStatus: true, queriedPartNumber: true, currentPartNumber: true, status: true },
      });
      if (!existing) throw new Error('VERIFICATION_NOT_FOUND');
      if (existing.approvalStatus !== 'PENDING') throw new Error('VERIFICATION_ALREADY_REVIEWED');

      const locked = await tx.officialPartVerification.updateMany({
        where: { id: existing.id, tenantId: input.tenantId, approvalStatus: 'PENDING' },
        data: {
          approvalStatus,
          reviewedById: input.userId,
          reviewedAt,
          reviewNote: input.reviewNote?.trim() || null,
        },
      });
      if (locked.count !== 1) throw new Error('VERIFICATION_ALREADY_REVIEWED');

      const updated = await tx.officialPartVerification.findUniqueOrThrow({
        where: { id: existing.id },
        include: rowInclude,
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          action: approvalStatus === 'APPROVED'
            ? 'OFFICIAL_PART_VERIFICATION_APPROVED'
            : 'OFFICIAL_PART_VERIFICATION_REJECTED',
          targetType: 'OfficialPartVerification',
          targetId: existing.id,
          metadata: {
            status: existing.status,
            approvalStatus,
            queriedPartNumber: existing.queriedPartNumber,
            currentPartNumber: existing.currentPartNumber,
            reviewNote: input.reviewNote?.trim() || null,
          },
        },
      });
      return updated;
    });

    return rowToSubmissionView(record);
  }
}
