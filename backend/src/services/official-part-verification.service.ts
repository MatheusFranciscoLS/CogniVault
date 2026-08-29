import { OfficialVerificationStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { AuditService } from './audit.service';
import { getVerifiedSupersession } from './part-supersession';

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

export class OfficialPartVerificationService {
  static async latestForCode(tenantId: string, partNumber: string): Promise<OfficialVerificationView> {
    const normalized = normalizeIdentifier(partNumber);
    const latest = normalized ? await prisma.officialPartVerification.findFirst({
      where: { tenantId, normalizedQueriedNumber: normalized },
      orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'desc' }],
      include: { user: { select: { email: true } } },
    }) : null;

    if (latest) {
      return {
        id: latest.id,
        state: mapStatus(latest.status),
        queriedPartNumber: latest.queriedPartNumber,
        currentPartNumber: latest.currentPartNumber,
        description: latest.description,
        officialUrl: latest.officialUrl,
        note: latest.note,
        verifiedAt: latest.verifiedAt.toISOString(),
        verifiedBy: latest.user.email,
        source: 'TENANT',
      };
    }

    const builtIn = getVerifiedSupersession(partNumber);
    if (builtIn) {
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

  static async resolveCurrentCode(tenantId: string, partNumber: string): Promise<OfficialVerificationView> {
    const verification = await this.latestForCode(tenantId, partNumber);
    return verification.state === 'SUPERSEDED' ? verification : { ...verification, currentPartNumber: partNumber };
  }

  static async history(tenantId: string, partNumber: string) {
    const normalized = normalizeIdentifier(partNumber);
    if (!normalized) return [];
    return prisma.officialPartVerification.findMany({
      where: { tenantId, normalizedQueriedNumber: normalized },
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
    const normalizedQueriedNumber = normalizeIdentifier(input.queriedPartNumber);
    const normalizedCurrentNumber = normalizeIdentifier(input.currentPartNumber);
    if (!normalizedQueriedNumber || !normalizedCurrentNumber) throw new Error('Informe códigos de peça válidos.');
    if (!Number.isFinite(input.verifiedAt.getTime())) throw new Error('Data da verificação inválida.');
    if (!isAllowedHusqvarnaPortalUrl(input.officialUrl, input.currentPartNumber)) {
      throw new Error('A URL oficial deve apontar exatamente para o Portal Husqvarna público usando o código atual.');
    }
    if (input.status === 'SUPERSEDED' && normalizedQueriedNumber === normalizedCurrentNumber) {
      throw new Error('Uma substituição precisa ter código antigo e código atual diferentes.');
    }
    if (input.status === 'VERIFIED' && normalizedQueriedNumber !== normalizedCurrentNumber) {
      throw new Error('Use o estado Código substituído quando o código atual for diferente do código consultado.');
    }

    const record = await prisma.officialPartVerification.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        status: input.status,
        queriedPartNumber: input.queriedPartNumber.trim(),
        normalizedQueriedNumber,
        currentPartNumber: input.currentPartNumber.trim(),
        normalizedCurrentNumber,
        description: input.description?.trim() || null,
        officialUrl: input.officialUrl,
        note: input.note?.trim() || null,
        verifiedAt: input.verifiedAt,
      },
      include: { user: { select: { email: true } } },
    });

    await AuditService.record({
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
    });

    return record;
  }
}
