import { createClient } from '@supabase/supabase-js';
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

export class DocumentService {
    async handleNewUpload(tenantId: string, filename: string, filePath: string, metadata: UploadMetadata = {}) {
        const document = await prisma.document.create({
            data: {
                tenantId,
                filename,
                url: filePath,
                status: 'PENDING',
                manufacturer: metadata.manufacturer?.trim() || null,
                model: metadata.model?.trim() || null,
                pnc: metadata.pnc?.trim() || null,
            },
        });

        await DocumentProducer.publishToQueue(document.id, tenantId);
        return document;
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
                _count: { select: { parts: true } },
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
            where: { id: documentId, tenantId, archivedAt: { not: null } },
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

        await prisma.document.update({
            where: { id: document.id },
            data: { status: 'PENDING' },
        });

        try {
            await DocumentProducer.publishToQueue(document.id, tenantId);
        } catch (error) {
            await prisma.document.update({
                where: { id: document.id },
                data: { status: document.status },
            });
            throw error;
        }

        return { ...document, status: 'PENDING' };
    }

    async listAdmin(tenantId: string) {
        const documents = await prisma.document.findMany({
            where: { tenantId },
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
                _count: { select: { parts: true } },
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
        }));
    }
}
