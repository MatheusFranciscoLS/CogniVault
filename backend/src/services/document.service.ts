import { prisma } from '../config/prisma';
import { DocumentProducer } from '../queues/producer';

export class DocumentService {

    async handleNewUpload(
        tenantId: string,
        filename: string,
        filePath: string
    ) {

        // =========================================================
        // 1. CRIA O DOCUMENTO
        // =========================================================

        const document = await prisma.document.create({
            data: {
                tenantId,
                filename,
                url: filePath,
                status: 'PENDING'
            }
        });

        console.log(
            `📚 Documento ${document.id} criado para o tenant ${tenantId}`
        );

        // =========================================================
        // 2. ENVIA PARA O RABBITMQ
        // =========================================================

        await DocumentProducer.publishToQueue(
            document.id,
            tenantId
        );

        console.log(
            `📤 Documento ${document.id} enviado para processamento`
        );

        return document;
    }
}
