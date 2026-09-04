import { prisma } from '../config/prisma';
import { inferCatalogCategory } from './catalog-category';
import { reconciledCatalogModel } from './catalog-metadata-reconciliation';

/**
 * Reconcilia metadados técnicos não revisados e persiste a família apenas quando
 * ela ainda não foi definida ou se estava temporariamente como 'Outros / Não identificado'.
 * Uma correção manual do administrador (metadataReviewedAt) sempre vence.
 */
export async function ensureCatalogCategory(documentId: string, tenantId: string): Promise<string | null> {
    const document = await prisma.document.findFirst({
        where: { id: documentId, tenantId },
        select: {
            id: true,
            filename: true,
            manufacturer: true,
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

    // Se a categoria foi REVISADA manualmente por um administrador, preserva a decisão:
    if (document.metadataReviewedAt && document.categoryId && document.category) {
        return document.category.name;
    }

    // Se já tem categoria e NÃO é 'Outros / Não identificado', já está devidamente classificado:
    if (document.categoryId && document.category && document.category.name !== 'Outros / Não identificado') {
        return document.category.name;
    }

    // Se não tem categoria OU a categoria atual é 'Outros / Não identificado',
    // re-infere agora com todas as evidências (fabricante, modelo reconciliado, filename, peças):
    const categoryName = inferCatalogCategory({
        filename: document.filename,
        manufacturer: document.manufacturer,
        model: resolvedModel || document.model,
        parts: document.parts,
    });

    const category = await prisma.category.upsert({
        where: { name_tenantId: { name: categoryName, tenantId } },
        update: {},
        create: { name: categoryName, tenantId },
    });

    await prisma.document.update({
        where: { id: document.id },
        data: { categoryId: category.id },
    });

    return category.name;
}
