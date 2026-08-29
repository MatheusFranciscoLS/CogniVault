import { prisma } from '../config/prisma';
import { inferCatalogCategory } from './catalog-category';

/**
 * Persiste a seção apenas quando o catálogo ainda não tem categoria. Dessa forma
 * uma correção manual do administrador nunca é sobrescrita por reprocessamento.
 */
export async function ensureCatalogCategory(documentId: string, tenantId: string): Promise<string | null> {
    const document = await prisma.document.findFirst({
        where: { id: documentId, tenantId },
        select: {
            id: true,
            filename: true,
            model: true,
            categoryId: true,
            category: { select: { name: true } },
            parts: {
                where: { active: true },
                take: 500,
                select: { name: true, section: true, notes: true },
            },
        },
    });

    if (!document) return null;
    if (document.categoryId && document.category) return document.category.name;

    const categoryName = inferCatalogCategory({
        filename: document.filename,
        model: document.model,
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
