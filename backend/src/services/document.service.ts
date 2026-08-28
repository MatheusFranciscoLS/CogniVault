import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { prisma } from '../config/prisma';
import { DocumentProducer } from '../queues/producer';

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
    const filename = value.replace(/\\/g, '/').split('/').pop()?.trim() || 'catalogo.pdf';
    return filename.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 240) || 'catalogo.pdf';
}

function hasPdfSignature(buffer: Buffer): boolean {
    return buffer.subarray(0, Math.min(buffer.length, 1024)).includes(Buffer.from('%PDF-'));
}

export class DocumentService {
    async handleNewUpload(tenantId: string, filename: string, filePath: string, metadata: UploadMetadata = {}) {
        try {
            const fileBuffer = fs.readFileSync(filePath);
            if (!hasPdfSignature(fileBuffer)) throw new Error('DOCUMENT_INVALID_PDF');
            const contentHash = createHash('sha256').update(fileBuffer).digest('hex');
            const duplicate = await prisma.document.findFirst({
                where: { tenantId, contentHash, archivedAt: null },
                select: { id: true },
            });

            if (duplicate) throw new Error(`DOCUMENT_DUPLICATE:${duplicate.id}`);

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
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (error) {
                    console.warn('⚠️ Não foi possível remover o upload temporário:', error);
                }
            }
        }
    }

    async list(tenantId: string) {
        const documents = await prisma.document.findMany({
            where: { tenantId, archivedAt: null },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                filename: true,
                status: true,
                manufacturer: true,
                model: true,
                pnc: true,
                createdAt: true,
                archivedAt: true,
                processingJobId: true,
                processingStage: true,
                processingCurrent: true,
                processingTotal: true,
                processingError: true,
                _count: { select: { parts: { where: { active: true } } } },
            },
        });

        return documents.map((document) => ({
            id: document.id,
            filename: document.filename,
            status: document.status,
            manufacturer: document.manufacturer,
            model: document.model,
            pnc: document.pnc,
            createdAt: document.createdAt,
            partCount: document._count.parts,
            archivedAt: document.archivedAt,
            processingActive: Boolean(document.processingJobId),
            processingStage: document.processingStage,
            processingCurrent: document.processingCurrent,
            processingTotal: document.processingTotal,
            processingError: document.processingError,
        }));
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
                .createSignedUrl(candidate, 60 * 10, download ? { download: document.filename } : undefined);

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

        if (document.processingJobId || ['PENDING', 'PROCESSING'].includes(document.status)) {
            throw new Error('DOCUMENT_ALREADY_PROCESSING');
        }

        const hasUsableCatalog = document.status === 'COMPLETED';
        const jobId = randomUUID();
        const locked = await prisma.document.updateMany({
            where: { id: document.id, tenantId, processingJobId: null },
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
        if (document.processingJobId) throw new Error('DOCUMENT_ALREADY_PROCESSING');

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
            select: {
                id: true,
                filename: true,
                status: true,
                manufacturer: true,
                model: true,
                pnc: true,
                createdAt: true,
                archivedAt: true,
                processingJobId: true,
                processingStage: true,
                processingCurrent: true,
                processingTotal: true,
                processingError: true,
                _count: { select: { parts: { where: { active: true } } } },
            },
        });

        return documents.map((document) => ({
            id: document.id,
            filename: document.filename,
            status: document.status,
            manufacturer: document.manufacturer,
            model: document.model,
            pnc: document.pnc,
            createdAt: document.createdAt,
            archivedAt: document.archivedAt,
            partCount: document._count.parts,
            processingActive: Boolean(document.processingJobId),
            processingStage: document.processingStage,
            processingCurrent: document.processingCurrent,
            processingTotal: document.processingTotal,
            processingError: document.processingError,
        }));
    }
}
