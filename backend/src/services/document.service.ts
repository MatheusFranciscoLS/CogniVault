import { createClient } from '@supabase/supabase-js';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { prisma } from '../config/prisma';
import { DocumentProducer } from '../queues/producer';
import { repairMultipartText } from '../utils/text-encoding';
import { CATALOG_CATEGORY_NAMES, inferCatalogCategory, isCatalogCategoryName } from './catalog-category';
import { ensureCatalogCategory } from './catalog-category-assignment';
import { inferCatalogModelFromFilename, isLikelyHusqvarnaPnc, isPlausibleCatalogModel, normalizeHusqvarnaPnc } from './catalog-extractor';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const storageBucket = process.env.STORAGE_BUCKET || 'catalogos';

if (!supabaseUrl || !supabaseKey) {
    throw new Error('❌ Chaves do Supabase não encontradas no .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export interface UploadMetadata {
    manufacturer?: string;
    model?: string;
    pnc?: string;
}

function storageCandidates(tenantId: string, documentId: string, storagePath?: string | null): string[] {
    return [...new Set(
        [storagePath, `${tenantId}/${documentId}.pdf`, `${documentId}.pdf`]
            .filter((value): value is string => Boolean(value)),
    )];
}

function safeFilename(value: string): string {
    const repaired = repairMultipartText(value);
    const filename = repaired.replace(/\\/g, '/').split('/').pop()?.trim() || 'catalogo.pdf';
    return filename.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 240) || 'catalogo.pdf';
}

function snapshotPncs(value: Prisma.JsonValue | null): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const raw = (value as Record<string, unknown>).pncs;
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((item): item is string => typeof item === 'string')
        .map(normalizeHusqvarnaPnc)
        .filter(Boolean);
}

function hasPdfSignature(buffer: Buffer): boolean {
    return buffer.subarray(0, Math.min(buffer.length, 1024)).includes(Buffer.from('%PDF-'));
}

/**
 * Registros antigos de desenvolvimento podem ter sido marcados COMPLETED sem
 * qualquer extração, peça ou metadado. Eles são preservados para auditoria, mas
 * não representam um catálogo técnico utilizável e não devem poluir a biblioteca.
 */
const legacyEmptyFilter = {
    status: 'COMPLETED',
    processingStage: 'IDLE',
    extractionMethod: null,
    manufacturer: null,
    model: null,
    pnc: null,
    parts: { none: { active: true } },
} as const;

const documentListSelect = {
    id: true,
    filename: true,
    status: true,
    manufacturer: true,
    model: true,
    pnc: true,
    extractionSnapshot: true,
    createdAt: true,
    archivedAt: true,
    processingJobId: true,
    processingStage: true,
    processingCurrent: true,
    processingTotal: true,
    processingError: true,
    extractionMethod: true,
    healthScore: true,
    reviewStatus: true,
    reviewReasons: true,
    qualityCheckedAt: true,
    category: { select: { name: true } },
    _count: { select: { parts: { where: { active: true } } } },
} as const;

type DocumentListRecord = Prisma.DocumentGetPayload<{ select: typeof documentListSelect }>;

function toDocumentListItem(document: DocumentListRecord, partPncs: string[] = []) {
    const filename = safeFilename(document.filename);
    const modelNeedsReview = !isPlausibleCatalogModel(document.model);
    const suggestedModel = modelNeedsReview ? inferCatalogModelFromFilename(filename) || null : null;
    const pncs = [...new Set([document.pnc || '', ...snapshotPncs(document.extractionSnapshot), ...partPncs]
        .filter(isLikelyHusqvarnaPnc)
        .map(normalizeHusqvarnaPnc))];
    return {
        id: document.id,
        filename,
        status: document.status,
        manufacturer: document.manufacturer,
        model: document.model,
        pnc: document.pnc,
        pncs,
        suggestedModel,
        modelNeedsReview,
        category: (() => {
            const stored = document.category?.name;
            if (stored && stored !== 'Outros / Não identificado') return stored;
            const inferred = inferCatalogCategory({ filename, model: document.model });
            return inferred !== 'Outros / Não identificado' ? inferred : (stored || 'Outros / Não identificado');
        })(),
        createdAt: document.createdAt,
        partCount: document._count.parts,
        archivedAt: document.archivedAt,
        processingActive: Boolean(document.processingJobId),
        processingStage: document.processingStage,
        processingCurrent: document.processingCurrent,
        processingTotal: document.processingTotal,
        processingError: document.processingError,
        extractionMethod: document.extractionMethod,
        healthScore: document.healthScore,
        reviewStatus: document.reviewStatus,
        reviewReasons: document.reviewReasons,
        qualityCheckedAt: document.qualityCheckedAt,
    };
}

async function documentListItems(tenantId: string, documents: DocumentListRecord[]) {
    const rows = documents.length ? await prisma.part.findMany({
        where: {
            documentId: { in: documents.map(document => document.id) },
            active: true,
            pnc: { not: null },
            document: { tenantId },
        },
        distinct: ['documentId', 'pnc'],
        select: { documentId: true, pnc: true },
    }) : [];
    const pncsByDocument = new Map<string, string[]>();
    for (const row of rows) {
        if (!row.pnc) continue;
        const values = pncsByDocument.get(row.documentId) || [];
        values.push(row.pnc);
        pncsByDocument.set(row.documentId, values);
    }

    // Auto-cura catálogos antigos que ficaram como 'Outros / Não identificado' ou sem categoria no banco:
    for (const doc of documents) {
        if (!doc.category?.name || doc.category.name === 'Outros / Não identificado') {
            ensureCatalogCategory(doc.id, tenantId).catch(err => {
                console.error(`[CatalogCategory] Erro na autocura do documento ${doc.id}:`, err);
            });
        }
    }

    return documents.map(document => toDocumentListItem(document, pncsByDocument.get(document.id)));
}

export class DocumentService {
    categories(): readonly string[] {
        return CATALOG_CATEGORY_NAMES;
    }

    async handleNewUpload(tenantId: string, filename: string, filePath: string, metadata: UploadMetadata = {}) {
        try {
            // PDFs podem ter até 50 MB; I/O assíncrono evita bloquear login,
            // buscas e health checks enquanto o arquivo é lido do disco.
            const fileBuffer = await readFile(filePath);
            if (!hasPdfSignature(fileBuffer)) throw new Error('DOCUMENT_INVALID_PDF');
            const contentHash = createHash('sha256').update(fileBuffer).digest('hex');
            const duplicate = await prisma.document.findFirst({
                where: { tenantId, contentHash, archivedAt: null },
                select: { id: true, status: true },
            });

            if (duplicate) {
                if (duplicate.status === 'FAILED') {
                    // Se o PDF anterior falhou, arquiva o registro morto para permitir nova extração limpa
                    await prisma.document.update({
                        where: { id: duplicate.id },
                        data: {
                            archivedAt: new Date(),
                            processingStage: 'REPLACED_ON_REUPLOAD',
                        },
                    });
                } else {
                    throw new Error(`DOCUMENT_DUPLICATE:${duplicate.id}`);
                }
            }

            const documentId = randomUUID();
            const jobId = randomUUID();
            const canonicalStoragePath = `${tenantId}/${documentId}.pdf`;
            const { error: uploadError } = await supabase.storage
                .from(storageBucket)
                .upload(canonicalStoragePath, fileBuffer, {
                    contentType: 'application/pdf',
                    upsert: false,
                });

            if (uploadError) throw new Error(`DOCUMENT_STORAGE_UPLOAD_FAILED:${uploadError.message}`);

            let document;
            try {
                document = await prisma.document.create({
                    data: {
                        id: documentId,
                        tenantId,
                        filename: safeFilename(filename),
                        url: canonicalStoragePath,
                        storagePath: canonicalStoragePath,
                        contentHash,
                        status: 'PENDING',
                        processingJobId: jobId,
                        processingStage: 'QUEUED',
                        processingCurrent: 0,
                        processingTotal: 0,
                        processingError: null,
                        manufacturer: metadata.manufacturer?.trim() || null,
                        model: metadata.model?.trim() || null,
                        pnc: metadata.pnc?.trim() || null,
                    },
                });
            } catch (error) {
                await supabase.storage.from(storageBucket).remove([canonicalStoragePath]);
                throw error;
            }

            try {
                await DocumentProducer.publishToQueue(document.id, tenantId, jobId);
            } catch (error) {
                await prisma.document.update({
                    where: { id: document.id },
                    data: {
                        status: 'FAILED',
                        processingJobId: null,
                        processingStage: 'FAILED',
                        processingError: 'A fila de processamento estava indisponível. Tente reprocessar.',
                    },
                });
                throw error;
            }

            return document;
        } finally {
            try {
                await unlink(filePath);
            } catch (error) {
                const code = typeof error === 'object' && error !== null && 'code' in error
                    ? String(error.code)
                    : '';
                if (code !== 'ENOENT') console.warn('⚠️ Não foi possível remover o upload temporário:', error);
            }
        }
    }

    async list(tenantId: string) {
        const documents = await prisma.document.findMany({
            where: {
                tenantId,
                archivedAt: null,
                processingStage: { not: 'REMOVED' },
                NOT: legacyEmptyFilter,
            },
            orderBy: { createdAt: 'desc' },
            select: documentListSelect,
        });

        return documentListItems(tenantId, documents);
    }

    async setCategory(tenantId: string, documentId: string, categoryName: unknown) {
        if (!isCatalogCategoryName(categoryName)) throw new Error('DOCUMENT_CATEGORY_INVALID');

        const document = await prisma.document.findFirst({
            where: { id: documentId, tenantId, processingStage: { not: 'REMOVED' } },
            select: { id: true, filename: true },
        });
        if (!document) throw new Error('DOCUMENT_NOT_FOUND');

        const category = await prisma.category.upsert({
            where: { name_tenantId: { name: categoryName, tenantId } },
            update: {},
            create: { name: categoryName, tenantId },
        });

        await prisma.document.update({
            where: { id: document.id },
            data: { categoryId: category.id },
        });

        return { id: document.id, filename: safeFilename(document.filename), category: category.name };
    }

    async createAccessUrl(tenantId: string, documentId: string, download = false): Promise<string> {
        const document = await prisma.document.findFirst({
            where: { id: documentId, tenantId, archivedAt: null },
        });

        if (!document) throw new Error('DOCUMENT_NOT_FOUND');
        if (document.status !== 'COMPLETED') throw new Error('DOCUMENT_NOT_READY');

        for (const candidate of storageCandidates(tenantId, document.id, document.storagePath)) {
            const { data, error } = await supabase.storage
                .from(storageBucket)
                .createSignedUrl(candidate, 60 * 10, download ? { download: safeFilename(document.filename) } : undefined);

            if (!error && data?.signedUrl) {
                return data.signedUrl;
            }
        }

        if (/^https?:\/\//i.test(document.url)) {
            return document.url;
        }

        throw new Error('DOCUMENT_URL_UNAVAILABLE');
    }

    async archive(tenantId: string, documentId: string, userId: string) {
        const document = await prisma.document.findFirst({
            where: { id: documentId, tenantId, archivedAt: null },
        });

        if (!document) throw new Error('DOCUMENT_NOT_FOUND');

        return prisma.document.update({
            where: { id: document.id },
            data: { archivedAt: new Date(), archivedById: userId },
        });
    }

    async restore(tenantId: string, documentId: string) {
        const document = await prisma.document.findFirst({
            where: { id: documentId, tenantId, archivedAt: { not: null }, processingStage: { not: 'REMOVED' } },
        });

        if (!document) throw new Error('DOCUMENT_NOT_FOUND');

        return prisma.document.update({
            where: { id: document.id },
            data: { archivedAt: null, archivedById: null },
        });
    }

    async reprocess(tenantId: string, documentId: string) {
        const document = await prisma.document.findFirst({
            where: { id: documentId, tenantId, archivedAt: null },
        });

        if (!document) throw new Error('DOCUMENT_NOT_FOUND');

        const isFailed = document.status === 'FAILED';
        if (!isFailed && (document.processingJobId || ['PENDING', 'PROCESSING'].includes(document.status))) {
            throw new Error('DOCUMENT_ALREADY_PROCESSING');
        }

        const hasUsableCatalog = document.status === 'COMPLETED';
        const jobId = randomUUID();
        const locked = await prisma.document.updateMany({
            where: {
                id: document.id,
                tenantId,
                OR: [
                    { processingJobId: null },
                    { status: 'FAILED' },
                ],
            },
            data: {
                status: hasUsableCatalog ? 'COMPLETED' : 'PENDING',
                processingJobId: jobId,
                // Reprocessar significa extrair o PDF novamente. O comportamento
                // anterior apenas repetia embeddings usando o snapshot antigo.
                processingStage: 'QUEUED_REEXTRACT',
                processingCurrent: 0,
                processingTotal: document.processingTotal,
                processingError: null,
            },
        });
        if (locked.count !== 1) throw new Error('DOCUMENT_ALREADY_PROCESSING');

        try {
            await DocumentProducer.publishToQueue(document.id, tenantId, jobId);
        } catch (error) {
            await prisma.document.updateMany({
                where: { id: document.id, processingJobId: jobId },
                data: {
                    status: document.status,
                    processingJobId: null,
                    processingStage: document.processingStage,
                    processingCurrent: document.processingCurrent,
                    processingTotal: document.processingTotal,
                    processingError: document.processingError,
                },
            });
            throw error;
        }

        return { ...document, status: hasUsableCatalog ? 'COMPLETED' : 'PENDING', processingJobId: jobId };
    }

    async removePdf(tenantId: string, documentId: string, userId: string) {
        const document = await prisma.document.findFirst({
            where: { id: documentId, tenantId, archivedAt: null },
        });

        if (!document) throw new Error('DOCUMENT_NOT_FOUND');

        if (document.processingJobId && document.status !== 'FAILED') {
            throw new Error('DOCUMENT_ALREADY_PROCESSING');
        }

        const archivedAt = new Date();
        await prisma.document.update({
            where: { id: document.id },
            data: {
                archivedAt,
                archivedById: userId,
                processingStage: 'REMOVING',
                processingError: null,
            },
        });

        const candidates = storageCandidates(tenantId, document.id, document.storagePath);
        const { error: removeError } = await supabase.storage.from(storageBucket).remove(candidates);
        if (removeError) {
            await prisma.document.update({
                where: { id: document.id },
                data: {
                    archivedAt: null,
                    archivedById: null,
                    processingStage: document.processingStage,
                    processingError: document.processingError,
                },
            });
            throw new Error(`DOCUMENT_STORAGE_DELETE_FAILED:${removeError.message}`);
        }

        return prisma.document.update({
            where: { id: document.id },
            data: {
                storagePath: null,
                url: '',
                processingStage: 'REMOVED',
                processingCurrent: 0,
                processingTotal: 0,
                processingError: null,
            },
        });
    }

    async listAdmin(tenantId: string) {
        const documents = await prisma.document.findMany({
            where: { tenantId, processingStage: { not: 'REMOVED' } },
            orderBy: { createdAt: 'desc' },
            select: documentListSelect,
        });

        return documentListItems(tenantId, documents);
    }
}
