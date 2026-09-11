import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

type AuditInput = {
    tenantId: string;
    userId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Prisma.InputJsonValue;
};

function auditData(input: AuditInput) {
    return {
        tenantId: input.tenantId,
        userId: input.userId || null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId || null,
        metadata: input.metadata,
    };
}

export class AuditService {
    static async record(input: AuditInput): Promise<void> {
        try {
            await prisma.auditLog.create({ data: auditData(input) });
        } catch (err) {
            // Auditoria informativa não derruba a operação de negócio.
            console.error('❌ Falha ao registrar auditoria:', err);
        }
    }

    static async recordRequired(input: AuditInput): Promise<string> {
        // Use apenas quando o AuditLog fizer parte do próprio controle operacional,
        // por exemplo como cooldown persistente para evitar consumo repetido de cota.
        const row = await prisma.auditLog.create({
            data: auditData(input),
            select: { id: true },
        });
        return row.id;
    }
}
