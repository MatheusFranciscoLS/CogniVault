import { prisma } from '../config/prisma';
import { DocumentProducer } from '../queues/producer';

export class DocumentService {
    async handleNewUpload(tenantId: string, filename: string, url: string) {
        const document = await prisma.document.create({
            data: {
                tenantId,
                filename,
                url,
                status: 'PENDING',
            },
        });

        await DocumentProducer.publishToQueue(document.id, tenantId);

        return document;
    }
}