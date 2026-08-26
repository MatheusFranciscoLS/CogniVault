import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../config/prisma';

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export class ChatService {
    static async askQuestion(tenantId: string, question: string) {
        if (!genAI) throw new Error('GEMINI_API_KEY ausente.');

        console.log(`\n🗣️ Pergunta recebida: "${question}"`);

        const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
        const result = await embeddingModel.embedContent(question);

        let questionVector = result.embedding.values;

        if (questionVector.length > 768) {
            questionVector = questionVector.slice(0, 768);
        }

        const vectorString = `[${questionVector.join(',')}]`;

        console.log('🔍 Varrendo o banco de dados via pgvector...');

        const similarChunks = await prisma.$queryRaw<Array<{ content: string }>>`
      SELECT "content"
      FROM "DocumentChunk"
      JOIN "Document" ON "Document"."id" = "DocumentChunk"."documentId"
      WHERE "Document"."tenantId" = ${tenantId}
      ORDER BY "embedding" <=> ${vectorString}::vector
      LIMIT 3;
    `;

        if (similarChunks.length === 0) {
            return "Ainda não tenho documentos suficientes para responder a isso.";
        }

        const context = similarChunks.map(chunk => chunk.content).join('\n\n---\n\n');

        console.log('🤖 Pedindo ao Gemini para formular a resposta...');

        // 🛡️ MUDANÇA AQUI: Usando o modelo universal mais estável do Google
        const chatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `Você é o CogniVault, um assistente corporativo inteligente.
    Responda à pergunta do usuário baseando-se ÚNICA E EXCLUSIVAMENTE nos trechos de documentos abaixo.
    Se a resposta não estiver no contexto fornecido, diga cordialmente que não tem essa informação.
    
    TRECHOS DE DOCUMENTOS:
    ${context}
    
    PERGUNTA DO USUÁRIO:
    ${question}`;

        const aiResponse = await chatModel.generateContent(prompt);
        return aiResponse.response.text();
    }
}