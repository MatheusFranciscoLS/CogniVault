import { PrismaClient } from '@prisma/client';
import { markCatalogProcessingStage } from '../services/catalog-processing-performance';

const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient;
    prismaProcessingTelemetryInstalled?: boolean;
};

const isDevelopment = process.env.NODE_ENV !== 'production';

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: ['error', 'warn'],
});

if (!globalForPrisma.prismaProcessingTelemetryInstalled) {
    prisma.$use(async (params, next) => {
        const result = await next(params);

        if (params.model === 'Document' && (params.action === 'update' || params.action === 'updateMany')) {
            const data = params.args?.data as Record<string, unknown> | undefined;
            const where = params.args?.where as Record<string, unknown> | undefined;
            const stage = typeof data?.processingStage === 'string' ? data.processingStage : '';
            const jobId = typeof where?.processingJobId === 'string' ? where.processingJobId : '';
            const documentId = typeof where?.id === 'string' ? where.id : undefined;
            const affected = typeof result === 'object' && result !== null && 'count' in result
                ? Number((result as { count?: unknown }).count || 0)
                : 1;

            if (stage && jobId && affected > 0) {
                markCatalogProcessingStage(jobId, stage, { documentId });
            }
        }

        return result;
    });
    globalForPrisma.prismaProcessingTelemetryInstalled = true;
}

if (isDevelopment) {
    globalForPrisma.prisma = prisma;
}
