import { Response } from 'express';
import { prisma } from '../config/prisma';
import { GoogleGenAI } from '@google/genai';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    throw new Error(
        '❌ GEMINI_API_KEY não definida no .env'
    );
}

const ai = new GoogleGenAI({
    apiKey
});

export class ChatController {

    async ask(
        req: AuthenticatedRequest,
        res: Response
    ): Promise<void> {

        try {

            // =========================================================
            // 1. AUTENTICAÇÃO
            // =========================================================

            if (!req.user) {
                res.status(401).json({
                    error: 'Usuário não autenticado.'
                });
                return;
            }

            const tenantId = req.user.tenantId;

            const { question } = req.body;

            if (
                typeof question !== 'string' ||
                !question.trim()
            ) {
                res.status(400).json({
                    error: 'A pergunta não pode estar vazia.'
                });
                return;
            }

            const normalizedQuestion =
                question.trim();

            console.log(
                `\n🤖 Pergunta do tenant ${tenantId}: "${normalizedQuestion}"`
            );

            // =========================================================
            // 2. EMBEDDING DA PERGUNTA
            //
            // IMPORTANTE:
            // Deve ser o mesmo modelo utilizado no AIService.
            // =========================================================

            console.log(
                '🧠 Gerando embedding da pergunta...'
            );

            const embedResult =
                await ai.models.embedContent({

                    model:
                        'gemini-embedding-001',

                    contents:
                        normalizedQuestion,

                    config: {

                        outputDimensionality:
                            768,

                        taskType:
                            'RETRIEVAL_QUERY'
                    }
                });

            const embedding =
                embedResult
                    .embeddings?.[0]
                    ?.values;

            if (
                !embedding ||
                embedding.length !== 768
            ) {
                throw new Error(
                    'Falha ao gerar embedding de 768 dimensões.'
                );
            }

            const embeddingString =
                `[${embedding.join(',')}]`;

            // =========================================================
            // 3. BUSCA SEMÂNTICA
            //
            // SOMENTE documentos do tenant autenticado.
            // =========================================================

            console.log(
                '🔎 Procurando peças nos catálogos...'
            );

            const matches: {
                content: string;
                documentId: string;
                filename: string;
                model: string | null;
                manufacturer: string | null;
            }[] = await prisma.$queryRaw`

                SELECT
                    dc."content",
                    dc."documentId",

                    d."filename",
                    d."model",
                    d."manufacturer"

                FROM "DocumentChunk" dc

                INNER JOIN "Document" d
                    ON d."id" = dc."documentId"

                WHERE
                    d."tenantId" = ${tenantId}

                    AND d."status" = 'COMPLETED'

                    AND dc."embedding" IS NOT NULL

                ORDER BY
                    dc."embedding"
                    <=> ${embeddingString}::vector

                LIMIT 15;

            `;

            // =========================================================
            // 4. NENHUM RESULTADO
            // =========================================================

            if (
                !matches ||
                matches.length === 0
            ) {

                console.log(
                    '⚠️ Nenhum resultado encontrado.'
                );

                res.status(200).json({

                    answer:
                        'Desculpe, não encontrei informações nos catálogos disponíveis.'
                });

                return;
            }

            console.log(
                `📚 ${matches.length} candidatos encontrados.`
            );

            // =========================================================
            // 5. MONTA O CONTEXTO
            // =========================================================

            const context =
                matches
                    .map(
                        (match, index) => {

                            return `
==================================================
CANDIDATO ${index + 1}
==================================================

CATÁLOGO:
${match.filename}

DOCUMENTO:
${match.documentId}

FABRICANTE:
${match.manufacturer || 'Não informado'}

MODELO:
${match.model || 'Não informado'}

DADOS DA PEÇA:
${match.content}

==================================================
`;
                        }
                    )
                    .join('\n');

            // =========================================================
            // 6. GEMINI ESCOLHE A PEÇA CORRETA
            // =========================================================

            console.log(
                '🧠 Gemini analisando os candidatos...'
            );

            const prompt = `

Você é um especialista mundial em catálogos
técnicos de peças mecânicas.

Você trabalha como uma segunda camada de
validação depois de uma busca semântica.

Sua tarefa é identificar a PEÇA EXATA
solicitada pelo mecânico.

==================================================
PERGUNTA DO MECÂNICO
==================================================

${normalizedQuestion}

==================================================
CANDIDATOS ENCONTRADOS NOS CATÁLOGOS
==================================================

${context}

==================================================
REGRAS ABSOLUTAS
==================================================

1. Use SOMENTE os candidatos fornecidos.

2. NÃO utilize conhecimento externo para inventar
   uma peça ou Part Number.

3. NUNCA invente um Part Number.

4. NUNCA corrija um Part Number.

5. NUNCA altere um Part Number.

6. Preserve exatamente:
   - letras
   - números
   - hífens
   - pontos
   - barras
   - zeros
   - espaços relevantes

7. O modelo da máquina é extremamente importante.

Se o usuário perguntar:

"carburador da 143RS"

você deve priorizar candidatos relacionados
ao modelo 143RS.

NÃO escolha automaticamente uma peça de:

143R
143RII
143
ou outro modelo.

8. O idioma NÃO deve impedir a identificação.

Por exemplo, considere possíveis relações
semânticas entre:

Português:
- carburador
- escapamento
- silenciador
- parafuso
- arruela
- porca

Inglês:
- carburetor
- carburettor
- exhaust
- muffler
- silencer
- screw
- bolt
- washer
- nut

Espanhol:
- carburador
- escape
- silenciador
- tornillo
- arandela
- tuerca

Francês:
- carburateur
- silencieux
- vis
- rondelle
- écrou

Alemão:
- Vergaser
- Schalldämpfer
- Schraube
- Unterlegscheibe
- Mutter

Esses termos podem representar peças
relacionadas, MAS NÃO assuma que sejam
automaticamente a mesma peça.

Use o contexto.

==================================================
PARAFUSOS E PEÇAS REPETIDAS
==================================================

Uma máquina pode possuir muitos parafusos.

Exemplo:

Posição 12:
Screw
Part Number: ABC123

Posição 24:
Screw
Part Number: XYZ789

Posição 31:
Screw
Part Number: QWE456

Eles NÃO são necessariamente a mesma peça.

Se o usuário perguntar:

"parafuso do carburador da 143RS"

não escolha simplesmente o primeiro resultado
que contém "screw".

Analise:

- modelo
- seção
- posição
- descrição
- componente relacionado
- Part Number
- contexto da vista explodida

==================================================
VISTAS EXPLODIDAS
==================================================

A posição da peça na vista explodida é
uma informação fundamental.

Exemplo:

POSIÇÃO:
17

não significa necessariamente que a peça
seja o item 17 em todos os catálogos.

A posição deve ser interpretada dentro
da respectiva:

- seção
- modelo
- vista explodida
- catálogo

==================================================
MÚLTIPLAS POSSIBILIDADES
==================================================

Se existirem duas ou mais peças realmente
compatíveis com a pergunta e não houver
informação suficiente para decidir:

NÃO invente.

Retorne as opções encontradas.

Exemplo:

"Encontrei mais de uma possibilidade:

1. Screw — posição 12 — Part Number ABC123
2. Screw — posição 18 — Part Number XYZ789

Preciso de mais informações para determinar
qual delas você deseja."

==================================================
QUANDO A PEÇA FOR ENCONTRADA
==================================================

Responda exatamente neste formato:

Peça: [nome da peça]
Modelo: [modelo]
Seção: [seção, se disponível]
Número na vista explodida: [posição, se disponível]
Part Number: **[código exato]**
Catálogo: [nome do catálogo]

==================================================
QUANDO NÃO FOR POSSÍVEL IDENTIFICAR
==================================================

Se os candidatos não forem suficientes para
identificar a peça com segurança, responda:

"Desculpe, não consegui identificar essa peça
com segurança nos catálogos."

NÃO tente adivinhar.

==================================================
IMPORTANTE
==================================================

Você não está aqui para explicar mecânica.

Sua função principal é localizar a peça correta
dentro dos catálogos fornecidos.

Precisão é mais importante que velocidade.

Nunca invente informações.
`;

            // =========================================================
            // 7. RESPOSTA FINAL DO GEMINI
            // =========================================================

            const response =
                await ai.models.generateContent({

                    model:
                        'gemini-3.7-flash',

                    contents:
                        prompt
                });

            const answer =
                response.text?.trim();

            if (!answer) {

                throw new Error(
                    'O Gemini não retornou uma resposta.'
                );
            }

            console.log(
                '✅ Peça analisada com sucesso!'
            );

            // =========================================================
            // 8. RETORNA PARA O FRONTEND
            // =========================================================

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
