import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { prisma } from '../config/prisma';
import crypto from 'crypto';
import { PDFParse } from 'pdf-parse';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    throw new Error(
        '❌ GEMINI_API_KEY não encontrada nas variáveis de ambiente.'
    );
}

const ai = new GoogleGenAI({
    apiKey,
});

export class AIService {
    static async processDocument(
        documentId: string,
        tenantId: string
    ) {
        console.log(
            `🧠 Iniciando IA para o documento: ${documentId}`
        );

        const document =
            await prisma.document.findUnique({
                where: {
                    id: documentId,
                },
            });

        if (!document) {
            throw new Error(
                'Documento não encontrado.'
            );
        }

        if (!document.url) {
            throw new Error(
                'URL do documento não encontrada.'
            );
        }

        console.log(
            '📄 Baixando PDF para leitura...'
        );

        const response =
            await fetch(document.url);

        if (!response.ok) {
            throw new Error(
                `Falha ao baixar PDF: ${response.status} ${response.statusText}`
            );
        }

        const buffer = Buffer.from(
            await response.arrayBuffer()
        );

        console.log(
            '📝 Extraindo texto e dividindo em blocos...'
        );

        const parser = new PDFParse({
            data: buffer,
        });

        let text = '';

        try {
            const pdfData =
                await parser.getText();

            text = pdfData.text;
        } finally {
            await parser.destroy();
        }

        if (!text.trim()) {
            throw new Error(
                'Não foi possível extrair texto do PDF.'
            );
        }

        console.log(
            `📖 Texto extraído: ${text.length} caracteres`
        );

        const chunks =
            this.splitText(text, 1000);

        console.log(
            `✂️ PDF dividido em ${chunks.length} pedaços.`
        );

        for (
            let i = 0;
            i < chunks.length;
            i++
        ) {
            const chunk = chunks[i];

            if (!chunk.trim()) {
                continue;
            }

            console.log(
                `🧠 Gerando embedding do bloco ${i + 1}/${chunks.length}...`
            );

            const result =
                await ai.models.embedContent({
                    model:
                        'gemini-embedding-001',

                    contents: chunk,

                    config: {
                        outputDimensionality: 768,
                        taskType:
                            'RETRIEVAL_DOCUMENT',
                    },
                });

            const embedding =
                result.embeddings?.[0]?.values;

            if (
                !embedding ||
                embedding.length !== 768
            ) {
                throw new Error(
                    `Embedding inválido. Dimensões recebidas: ${embedding?.length ?? 0
                    }`
                );
            }

            console.log(
                `✅ Embedding gerado com ${embedding.length} dimensões.`
            );

            const embeddingString =
                `[${embedding.join(',')}]`;

            const chunkId =
                crypto.randomUUID();

            await prisma.$executeRaw`
                INSERT INTO "DocumentChunk"
                (
                    "id",
                    "documentId",
                    "content",
                    "embedding"
                )
                VALUES (
                    ${chunkId},
                    ${documentId},
                    ${chunk},
                    ${embeddingString}::vector
                )
            `;

            console.log(
                `💾 Bloco ${i + 1} salvo no PostgreSQL.`
            );
        }

        console.log(
            `🚀 Vetorização concluída com sucesso para o documento ${documentId}.`
        );
    }

    private static splitText(
        text: string,
        maxLength: number
    ): string[] {
        const words =
            text.split(/\s+/);

        const chunks: string[] = [];

        let currentChunk = '';

        for (const word of words) {
            const nextLength =
                currentChunk.length +
                word.length +
                1;

            if (
                nextLength > maxLength &&
                currentChunk.trim()
            ) {
                chunks.push(
                    currentChunk.trim()
                );

                currentChunk = '';
            }

            currentChunk +=
                `${word} `;
        }

        if (currentChunk.trim()) {
            chunks.push(
                currentChunk.trim()
            );
        }

        return chunks;
    }
}

