import { GoogleGenAI } from '@google/genai';
import { prisma } from '../config/prisma';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    throw new Error(
        '❌ GEMINI_API_KEY não encontrada nas variáveis de ambiente.'
    );
}

const ai = new GoogleGenAI({
    apiKey,
});

export class ChatService {
    static async askQuestion(
        tenantId: string,
        question: string
    ) {
        console.log(
            `\n🗣️ Pergunta recebida: "${question}"`
        );

        /*
         * 1. Gerar embedding da pergunta
         */
        console.log(
            '🧠 Gerando embedding da pergunta...'
        );

        const embeddingResult =
            await ai.models.embedContent({
                model: 'gemini-embedding-001',
                contents: question,
                config: {
                    outputDimensionality: 768,
                    taskType: 'RETRIEVAL_QUERY',
                },
            });

        const questionVector =
            embeddingResult.embeddings?.[0]?.values;

        if (
            !questionVector ||
            questionVector.length !== 768
        ) {
            throw new Error(
                `Embedding da pergunta inválido. Dimensões recebidas: ${questionVector?.length ?? 0
                }`
            );
        }

        console.log(
            `✅ Embedding da pergunta gerado com ${questionVector.length} dimensões.`
        );

        const vectorString =
            `[${questionVector.join(',')}]`;

        /*
         * 2. Buscar os chunks mais semelhantes
         */
        console.log(
            '🔍 Varrendo o banco de dados via pgvector...'
        );

        const similarChunks =
            await prisma.$queryRaw<
                Array<{ content: string }>
            >`
                SELECT "content"
                FROM "DocumentChunk"
                JOIN "Document"
                    ON "Document"."id" = "DocumentChunk"."documentId"
                WHERE "Document"."tenantId" = ${tenantId}
                ORDER BY
                    "embedding" <=> ${vectorString}::vector
                LIMIT 3;
            `;

        if (similarChunks.length === 0) {
            return 'Ainda não tenho documentos suficientes para responder a isso.';
        }

        /*
         * 3. Montar contexto
         */
        const context =
            similarChunks
                .map(
                    (chunk) => chunk.content
                )
                .join('\n\n---\n\n');

        console.log(
            `📚 ${similarChunks.length} trechos encontrados.`
        );

        /*
         * 4. Criar prompt
         */
        const prompt = `
Você é o CogniVault, um assistente corporativo inteligente.

Responda à pergunta do usuário baseando-se ÚNICA E EXCLUSIVAMENTE
nos trechos de documentos fornecidos abaixo.

REGRAS:
- Não invente informações.
- Não use conhecimento externo aos documentos.
- Se a resposta não estiver nos documentos, diga cordialmente
  que não encontrou essa informação nos documentos disponíveis.
- Responda de forma clara e objetiva.
- Quando houver informações relevantes em mais de um trecho,
  combine-as de forma coerente.

TRECHOS DE DOCUMENTOS:
${context}

PERGUNTA DO USUÁRIO:
${question}
`;

        /*
         * 5. Gerar resposta
         */
        console.log(
            '🤖 Pedindo ao Gemini para formular a resposta...'
        );

        const response =
            await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: prompt,
            });

        const answer = response.text;

        if (!answer) {
            throw new Error(
                'O Gemini não retornou uma resposta.'
            );
        }

        console.log(
            '✅ Resposta gerada com sucesso.'
        );

        return answer;
    }
}
