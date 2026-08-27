import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export class AuditService {
    static async record(input: {
        tenantId: string;
        userId?: string | null;
        action: string;
        targetType: string;
        targetId?: string | null;
        metadata?: Prisma.InputJsonValue;
    }): Promise<void> {
        await prisma.auditLog.create({
            data: {
                tenantId: input.tenantId,
                userId: input.userId || null,
                action: input.action,
                targetType: input.targetType,
                targetId: input.targetId || null,
                metadata: input.metadata,
            },
        });
    }
}
