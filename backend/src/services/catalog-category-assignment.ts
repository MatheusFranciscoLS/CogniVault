import { prisma } from '../config/prisma';
import { inferCatalogCategory } from './catalog-category';
import { reconciledCatalogModel } from './catalog-metadata-reconciliation';

/**
 * Reconcilia metadados técnicos não revisados e persiste a família apenas quando
 * ela ainda não foi definida. Uma correção manual do administrador sempre vence.
 */
export async function ensureCatalogCategory(documentId: string, tenantId: string): Promise<string | null> {
    const document = await prisma.document.findFirst({
        where: { id: documentId, tenantId },
        select: {
            id: true,
            filename: true,
            model: true,
            metadataReviewedAt: true,
            categoryId: true,
            category: { select: { name: true } },
            parts: {
                where: { active: true },
                take: 500,
                select: { model: true, name: true, section: true, notes: true },
            },
        },
    });

    if (!document) return null;

    const resolvedModel = reconciledCatalogModel({
        storedModel: document.model,
        metadataReviewedAt: document.metadataReviewedAt,
        partModels: document.parts.map(part => part.model),
    });
    if (resolvedModel !== (document.model || null)) {
        await prisma.document.updateMany({
            where: { id: document.id, tenantId, metadataReviewedAt: null },
            data: { model: resolvedModel },
        });
    }

    if (document.categoryId && document.category) return document.category.name;

    const categoryName = inferCatalogCategory({
        filename: document.filename,
        model: resolvedModel,
        parts: document.parts,
    });
    const category = await prisma.category.upsert({
        where: { name_tenantId: { name: categoryName, tenantId } },
        update: {},
        create: { name: categoryName, tenantId },
    });

    await prisma.document.updateMany({
        where: { id: document.id, tenantId, categoryId: null },
        data: { categoryId: category.id },
    });

    return category.name;
}
