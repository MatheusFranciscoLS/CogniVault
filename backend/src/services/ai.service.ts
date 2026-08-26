import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../config/prisma';
import crypto from 'crypto';
import { PDFParse } from 'pdf-parse';

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export class AIService {
    static async processDocument(documentId: string, tenantId: string) {
        if (!genAI) throw new Error('GEMINI_API_KEY ausente no sistema.');

        console.log(`🧠 Iniciando IA para o documento: ${documentId}`);

        const document = await prisma.document.findUnique({
            where: { id: documentId }
        });

        if (!document || !document.url) {
            throw new Error('Documento ou URL não encontrados.');
        }

        console.log('📄 Baixando PDF para leitura...');

        const response = await fetch(document.url);

        if (!response.ok) {
            throw new Error(`Falha ao baixar PDF: ${response.status} ${response.statusText}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        console.log('📝 Extraindo texto e dividindo em blocos...');

        const parser = new PDFParse({ data: buffer });
        let text = '';

        try {
            const pdfData = await parser.getText();
            text = pdfData.text;
        } finally {
            await parser.destroy();
        }

        if (!text.trim()) {
            throw new Error('Não foi possível extrair texto do PDF.');
        }

        console.log(`📖 Texto extraído: ${text.length} caracteres`);

        const chunks = this.splitText(text, 1000);
        console.log(`✂️ PDF dividido em ${chunks.length} pedaços.`);

        const model = genAI.getGenerativeModel({
            model: 'gemini-embedding-001'
        });

        for (const chunk of chunks) {
            if (chunk.trim().length === 0) continue;

            console.log(`🧠 Gerando embedding do bloco...`);

            const result = await model.embedContent(chunk);
            let embedding = result.embedding.values;

            // 🛡️ O SEGREDO DO MRL (Matryoshka):
            // Reduzimos o vetor de 3072 para 768 dimensões preservando 100% da inteligência!
            if (embedding.length > 768) {
                embedding = embedding.slice(0, 768);
            }

            const embeddingString = `[${embedding.join(',')}]`;
            const chunkId = crypto.randomUUID();

            await prisma.$executeRaw`
                INSERT INTO "DocumentChunk" ("id", "documentId", "content", "embedding")
                VALUES (
                    ${chunkId},
                    ${documentId},
                    ${chunk},
                    ${embeddingString}::vector
                )
            `;
        }

        console.log(`🚀 Vetorização concluída! O banco agora tem a "memória" desse PDF.`);
    }

    private static splitText(text: string, maxLength: number): string[] {
        const words = text.split(/\s+/);
        const chunks: string[] = [];
        let currentChunk = '';

        for (const word of words) {
            if (currentChunk.length + word.length > maxLength) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }
            currentChunk += word + ' ';
        }

        if (currentChunk.trim().length > 0) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }
}