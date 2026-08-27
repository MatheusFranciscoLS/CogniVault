import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    throw new Error('Chave do Gemini não encontrada no .env');
}

const ai = new GoogleGenAI({ apiKey });

export class ChatController {
    async ask(req: Request, res: Response): Promise<void> {
        try {
            const { tenantId, question } = req.body;

            if (!tenantId) {
                res.status(400).json({
                    error: 'Tenant não informado.'
                });
                return;
            }

            if (!question?.trim()) {
                res.status(400).json({
                    error: 'A pergunta não pode estar vazia.'
                });
                return;
            }

            console.log(
                `\n🤖 Nova pergunta recebida do Front-end: "${question}"`
            );

            // =========================================================
            // 1. EMBEDDING DA PERGUNTA
            // =========================================================
            const embedResult = await ai.models.embedContent({
                model: 'text-embedding-004', // 🚀 MUDE APENAS O NOME AQUI!
                contents: question,
                config: {
                    outputDimensionality: 768,
                    taskType: 'RETRIEVAL_QUERY'
                }
            });

            const embedding = embedResult.embeddings?.[0]?.values;

            if (!embedding || embedding.length !== 768) {
                throw new Error(
                    'Falha ao gerar embedding de 768 dimensões.'
                );
            }

            const embeddingString = `[${embedding.join(',')}]`;

            // =========================================================
            // 2. BUSCA SEMÂNTICA NO BANCO
            // SOMENTE NOS DOCUMENTOS DO TENANT ATUAL
            // =========================================================

            console.log(
                '🔎 Caçando a resposta nos catálogos do tenant...'
            );

            const matches: { content: string }[] =
                await prisma.$queryRaw`
                    SELECT dc."content"
                    FROM "DocumentChunk" dc
                    INNER JOIN "Document" d
                        ON d."id" = dc."documentId"
                    WHERE d."tenantId" = ${tenantId}
                    ORDER BY dc."embedding" <=> ${embeddingString}::vector
                    LIMIT 5;
                `;

            if (!matches || matches.length === 0) {
                res.status(200).json({
                    answer:
                        'Ainda não encontrei informações nos catálogos deste cliente para responder a essa pergunta.'
                });
                return;
            }

            // =========================================================
            // 3. MONTA O CONTEXTO
            // =========================================================

            const context = matches
                .map((match) => match.content)
                .join('\n\n---\n\n');

            // =========================================================
            // 4. GEMINI 3.7 FLASH
            // RESPONDE SOMENTE COM BASE NO CONTEXTO
            // =========================================================

            console.log(
                '🧠 Montando a resposta final com o Gemini 3.7 Flash...'
            );

            const prompt = `
Você é um assistente técnico especializado em mecânica
e catálogos de peças de máquinas.

Sua missão é responder à pergunta do mecânico usando
EXCLUSIVAMENTE as informações presentes no contexto abaixo.

REGRAS OBRIGATÓRIAS:

1. Não invente peças.
2. Não invente códigos.
3. Não altere números de Part Number.
4. Não utilize conhecimento externo ao contexto.
5. Sempre que encontrar a peça, informe:
   - Nome da peça
   - Part Number
   - Número da peça na vista explodida, se disponível
   - Seção, se disponível
6. Destaque o Part Number em negrito.
7. Seja direto e objetivo.
8. Se a informação solicitada não estiver claramente presente
   no contexto, responda exatamente:

"Desculpe, não consegui encontrar essa peça nos catálogos."

CONTEXTO DOS CATÁLOGOS:

${context}

PERGUNTA DO MECÂNICO:

${question}
`;

            const response = await ai.models.generateContent({
                model: 'gemini-3.7-flash',
                contents: prompt,
            });

            const answer = response.text;

            if (!answer) {
                throw new Error(
                    'O Gemini não retornou uma resposta.'
                );
            }

            console.log(
                '✅ Resposta enviada para a tela!'
            );

            res.status(200).json({
                answer
            });

        } catch (error) {
            console.error(
                '❌ Erro no Chat:',
                error
            );

            res.status(500).json({
                error:
                    'Erro interno ao processar a pergunta.'
            });
        }
    }
}
