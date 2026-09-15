import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { inferCatalogCategory } from './catalog-category';
import { repairAutoDetectedDocumentMetadata } from './catalog-metadata-repair';

export function automaticCategoryAssignmentWhere(
    documentId: string,
    tenantId: string,
    observedCategoryId: string | null,
    observedMetadataReviewedAt: Date | null,
): Prisma.DocumentWhereInput {
    return {
        id: documentId,
        tenantId,
        categoryId: observedCategoryId,
        metadataReviewedAt: observedMetadataReviewedAt,
    };
}

/**
 * Garante que metadados automáticos suspeitos sejam reparados pela política
 * central antes de classificar o catálogo. Uma correção manual do administrador
 * (metadataReviewedAt) sempre vence.
 *
 * A família só é persistida quando ainda não foi definida ou quando estava
 * temporariamente como 'Outros / Não identificado'.
 */
export async function ensureCatalogCategory(documentId: string, tenantId: string): Promise<string | null> {
    await repairAutoDetectedDocumentMetadata(documentId, tenantId);

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

    // Se a categoria foi REVISADA manualmente por um administrador, preserva a decisão:
    if (document.metadataReviewedAt && document.categoryId && document.category) {
        return document.category.name;
    }

    // Se já tem categoria e NÃO é 'Outros / Não identificado', já está devidamente classificado:
    if (document.categoryId && document.category && document.category.name !== 'Outros / Não identificado') {
        return document.category.name;
    }

    // Se não tem categoria OU a categoria atual é 'Outros / Não identificado',
    // re-infere agora com todas as evidências já reconciliadas:
    const categoryName = inferCatalogCategory({
        filename: document.filename,
        manufacturer: document.manufacturer,
        model: document.model,
        parts: document.parts,
    });

    const category = await prisma.category.upsert({
        where: { name_tenantId: { name: categoryName, tenantId } },
        update: {},
        create: { name: categoryName, tenantId },
    });

    // Compare-and-set: uma escolha/revisão manual feita depois da leitura acima
    // deve vencer a classificação automática, nunca ser sobrescrita por ela.
    const assigned = await prisma.document.updateMany({
        where: automaticCategoryAssignmentWhere(
            document.id,
            tenantId,
            document.categoryId,
            document.metadataReviewedAt,
        ),
        data: { categoryId: category.id },
    });

    if (assigned.count === 0) {
        const current = await prisma.document.findFirst({
            where: { id: document.id, tenantId },
            select: { category: { select: { name: true } } },
        });
        return current?.category?.name ?? null;
    }

    return category.name;
}
