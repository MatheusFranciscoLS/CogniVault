import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { prisma } from '../config/prisma';
import { DocumentProducer } from '../queues/producer';
import { repairMultipartText } from '../utils/text-encoding';
import { isCatalogCategoryName } from './catalog-category';

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

function isPrismaUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && String((error as { code?: unknown }).code) === 'P2002';
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

function hasPdfSignature(buffer: Buffer): boolean {
    return buffer.subarray(0, Math.min(buffer.length, 1024)).includes(Buffer.from('%PDF-'));
}

export class DocumentService {
    async handleNewUpload(tenantId: string, filename: string, filePath: string, metadata: UploadMetadata = {}) {
        try {
            const fileBuffer = await readFile(filePath);
            if (!hasPdfSignature(fileBuffer)) throw new Error('DOCUMENT_INVALID_PDF');
            const contentHash = createHash('sha256').update(fileBuffer).digest('hex');
            const duplicate = await prisma.document.findFirst({
                where: { tenantId, contentHash, archivedAt: null },
                select: { id: true, status: true },
            });

            if (duplicate) {
                if (duplicate.status === 'FAILED') {
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
                if (isPrismaUniqueConstraintError(error)) {
                    const concurrentDuplicate = await prisma.document.findFirst({
                        where: { tenantId, contentHash, archivedAt: null },
                        select: { id: true },
                    });
                    if (concurrentDuplicate) throw new Error(`DOCUMENT_DUPLICATE:${concurrentDuplicate.id}`);
                }
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

        if (document.contentHash) {
            const duplicate = await prisma.document.findFirst({
                where: {
                    tenantId,
                    contentHash: document.contentHash,
                    archivedAt: null,
                    id: { not: document.id },
                },
                select: { id: true },
            });
            if (duplicate) throw new Error(`DOCUMENT_DUPLICATE:${duplicate.id}`);
        }

        try {
            return await prisma.document.update({
                where: { id: document.id },
                data: { archivedAt: null, archivedById: null },
            });
        } catch (error) {
            if (document.contentHash && isPrismaUniqueConstraintError(error)) {
                const duplicate = await prisma.document.findFirst({
                    where: {
                        tenantId,
                        contentHash: document.contentHash,
                        archivedAt: null,
                        id: { not: document.id },
                    },
                    select: { id: true },
                });
                if (duplicate) throw new Error(`DOCUMENT_DUPLICATE:${duplicate.id}`);
            }
            throw error;
        }
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
}
