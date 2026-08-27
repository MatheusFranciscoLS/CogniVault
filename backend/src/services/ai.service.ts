import { prisma } from '../config/prisma';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const apiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!apiKey || !supabaseUrl || !supabaseKey) {
    throw new Error(
        '❌ Chaves de API (Gemini ou Supabase) não encontradas no .env'
    );
}

const ai = new GoogleGenAI({
    apiKey
});

const supabase = createClient(
    supabaseUrl,
    supabaseKey
);

export class AIService {

    static async processDocument(
        documentId: string,
        tenantId: string
    ): Promise<void> {

        let localFilePath: string | null = null;
        let uploadedFileName: string | null = null;

        try {

            console.log(
                `\n🧠 Iniciando processamento do documento: ${documentId}`
            );

            // =========================================================
            // 1. BUSCAR DOCUMENTO
            // =========================================================

            const document =
                await prisma.document.findUnique({
                    where: {
                        id: documentId
                    }
                });

            if (!document) {
                throw new Error(
                    'Documento não encontrado no banco de dados.'
                );
            }

            // =========================================================
            // 2. VALIDAR TENANT
            // =========================================================

            if (document.tenantId !== tenantId) {
                throw new Error(
                    'Documento não pertence ao tenant informado.'
                );
            }

            console.log(
                `🔐 Documento pertence ao tenant correto: ${tenantId}`
            );

            // =========================================================
            // 3. LOCALIZAR ARQUIVO TEMPORÁRIO
            // =========================================================

            if (!document.url) {
                throw new Error(
                    'Caminho do arquivo temporário não encontrado no documento.'
                );
            }

            localFilePath =
                path.resolve(document.url);

            console.log(
                `📁 Arquivo temporário: ${localFilePath}`
            );

            if (!fs.existsSync(localFilePath)) {
                throw new Error(
                    `Arquivo não encontrado no servidor: ${localFilePath}`
                );
            }

            // =========================================================
            // 4. SALVAR PDF NO SUPABASE
            // =========================================================

            console.log(
                '☁️ Enviando PDF para o Supabase...'
            );

            const fileBuffer =
                fs.readFileSync(localFilePath);

            const storagePath =
                `${tenantId}/${documentId}.pdf`;

            const {
                error: uploadError
            } = await supabase.storage
                .from('catalogs')
                .upload(
                    storagePath,
                    fileBuffer,
                    {
                        contentType:
                            'application/pdf',

                        upsert: true
                    }
                );

            if (uploadError) {
                throw new Error(
                    `Erro no Supabase: ${uploadError.message}`
                );
            }

            console.log(
                '✅ PDF enviado para o Supabase.'
            );

            // =========================================================
            // 5. GERAR URL DO PDF
            // =========================================================

            const {
                data: publicUrlData
            } = supabase.storage
                .from('catalogs')
                .getPublicUrl(
                    storagePath
                );

            if (!publicUrlData?.publicUrl) {
                throw new Error(
                    'Não foi possível gerar a URL pública do PDF.'
                );
            }

            await prisma.document.update({
                where: {
                    id: documentId
                },
                data: {
                    url:
                        publicUrlData.publicUrl
                }
            });

            console.log(
                `🔗 URL do catálogo: ${publicUrlData.publicUrl}`
            );

            // =========================================================
            // 6. ENVIAR PDF PARA GEMINI FILE API
            // =========================================================

            console.log(
                '📤 Enviando PDF para Gemini...'
            );

            const uploadedFile =
                await ai.files.upload({
                    file: localFilePath,
                    config: {
                        mimeType:
                            'application/pdf'
                    }
                });

            uploadedFileName =
                uploadedFile.name || null;

            if (!uploadedFile.uri) {
                throw new Error(
                    'Gemini não retornou URI do arquivo.'
                );
            }

            console.log(
                `✅ PDF enviado para Gemini: ${uploadedFile.uri}`
            );

            console.log(
                '👁️ Gemini analisando o catálogo...'
            );

            // =========================================================
            // 7. PROMPT DE EXTRAÇÃO
            // =========================================================

            const prompt = `
Você é um especialista em interpretação de catálogos
técnicos de peças mecânicas.

Este PDF é um catálogo de peças e pode conter:

- vistas explodidas
- tabelas
- diagramas
- códigos de peças
- diferentes modelos da mesma máquina
- diferentes idiomas
- abreviações
- nomes técnicos diferentes para a mesma peça.

Sua tarefa é transformar o catálogo em uma BASE DE DADOS
ESTRUTURADA DE PEÇAS.

==================================================
OBJETIVO
==================================================

Para cada vista explodida encontrada:

1. Identifique o modelo da máquina.
2. Identifique a seção/sistema.
3. Identifique cada posição numerada da vista.
4. Relacione a posição da vista com a tabela correspondente.
5. Encontre o nome da peça.
6. Encontre o Part Number exato.
7. Preserve exatamente o código encontrado no catálogo.
8. Registre nomes alternativos encontrados no catálogo.
9. Não invente nenhuma informação.

==================================================
IDIOMAS
==================================================

O PDF pode misturar idiomas.

Uma peça pode aparecer como:

Português:
- escapamento
- silenciador
- parafuso

Inglês:
- muffler
- silencer
- screw
- bolt

Espanhol:
- escape
- silenciador
- tornillo

Alemão:
- Schalldämpfer
- Schraube

Esses termos podem representar componentes relacionados,
mas NÃO assuma que são sempre a mesma peça.

Use a posição, seção, modelo e tabela para determinar
a correspondência correta.

==================================================
IMPORTANTE SOBRE PARAFUSOS
==================================================

Uma máquina pode possuir dezenas de parafusos.

NÃO agrupe todos os parafusos.

Cada posição deve ser tratada como uma peça independente.

Por exemplo:

Posição 12
Seção: Carburador
Nome: Screw
Part Number: ABC123

Posição 31
Seção: Escapamento
Nome: Screw
Part Number: XYZ789

Essas são duas peças diferentes.

==================================================
MODELO
==================================================

O modelo da máquina é MUITO IMPORTANTE.

Se a página pertence ao modelo:

143RS

registre:

Modelo: 143RS

Não misture peças de:

143R
143RS
143RII

etc.

a menos que o próprio catálogo indique
explicitamente que a peça é compartilhada.

==================================================
FORMATO OBRIGATÓRIO
==================================================

Retorne SOMENTE os registros das peças.

Use exatamente este formato:

[PECA]
MODELO: ...
SECAO: ...
POSICAO: ...
NOME: ...
NOMES_ALTERNATIVOS: ...
PART_NUMBER: ...
PAGINA: ...

[PECA]
MODELO: ...
SECAO: ...
POSICAO: ...
NOME: ...
NOMES_ALTERNATIVOS: ...
PART_NUMBER: ...
PAGINA: ...

==================================================
REGRAS CRÍTICAS
==================================================

- Não invente Part Number.
- Não corrija Part Number.
- Não traduza Part Number.
- Não altere letras ou números.
- Não elimine zeros.
- Não remova hífens.
- Não misture peças de modelos diferentes.
- Não misture seções diferentes.
- Não agrupe posições diferentes.
- Se não conseguir identificar uma informação,
  deixe o campo vazio.
- Extraia o máximo possível.
- Analise todas as páginas do PDF.
`;

            // =========================================================
            // 8. GEMINI LÊ O PDF
            // =========================================================

            const visionResponse =
                await ai.models.generateContent({

                    model:
                        'gemini-2.5-flash',

                    contents: [
                        {
                            role: 'user',

                            parts: [
                                {
                                    fileData: {
                                        fileUri:
                                            uploadedFile.uri,

                                        mimeType:
                                            'application/pdf'
                                    }
                                },

                                {
                                    text:
                                        prompt
                                }
                            ]
                        }
                    ]
                });

            const text =
                visionResponse.text;

            if (!text?.trim()) {
                throw new Error(
                    'Gemini não conseguiu extrair informações do PDF.'
                );
            }

            console.log(
                `📖 Extração concluída: ${text.length} caracteres.`
            );

            // =========================================================
            // 9. DIVIDIR POR PEÇA
            // =========================================================

            const chunks =
                text
                    .split('[PECA]')
                    .map(
                        chunk =>
                            chunk.trim()
                    )
                    .filter(
                        chunk =>
                            chunk.length > 30
                    );

            if (chunks.length === 0) {
                throw new Error(
                    'Gemini não retornou nenhuma peça no formato esperado.'
                );
            }

            console.log(
                `🔪 ${chunks.length} peças encontradas.`
            );

            // =========================================================
            // 10. APAGAR CHUNKS ANTIGOS
            // =========================================================

            await prisma.documentChunk.deleteMany({
                where: {
                    documentId
                }
            });

            console.log(
                '🧹 Chunks antigos removidos.'
            );

            // =========================================================
            // 11. GERAR EMBEDDINGS
            // =========================================================

            let processed = 0;

            for (const chunk of chunks) {

                try {

                    const embedResult =
                        await ai.models.embedContent({

                            model:
                                'gemini-embedding-001',

                            contents:
                                chunk,

                            config: {
                                outputDimensionality:
                                    768,

                                taskType:
                                    'RETRIEVAL_DOCUMENT'
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

                        console.error(
                            '⚠️ Embedding inválido. Pulando peça.'
                        );

                        continue;
                    }

                    const embeddingString =
                        `[${embedding.join(',')}]`;

                    // =================================================
                    // 12. SALVAR CHUNK + EMBEDDING
                    // =================================================

                    await prisma.$executeRaw`

                        INSERT INTO "DocumentChunk"
                        (
                            "id",
                            "documentId",
                            "content",
                            "embedding"
                        )

                        VALUES
                        (
                            gen_random_uuid(),
                            ${documentId},
                            ${chunk},
                            ${embeddingString}::vector
                        )

                    `;

                    processed++;

                    console.log(
                        `🔢 Peça ${processed}/${chunks.length} processada.`
                    );

                } catch (embeddingError) {

                    console.error(
                        '⚠️ Erro ao gerar embedding da peça:',
                        embeddingError
                    );
                }
            }

            // =========================================================
            // 13. GARANTIR QUE ALGUMA PEÇA FOI PROCESSADA
            // =========================================================

            if (processed === 0) {
                throw new Error(
                    'Nenhuma peça conseguiu ser transformada em embedding.'
                );
            }

            console.log(
                `📦 ${processed} peças armazenadas no banco.`
            );

            // =========================================================
            // 14. FINALIZA
            // =========================================================

            console.log(
                `\n🏆 CATÁLOGO ${documentId} PROCESSADO COM SUCESSO!`
            );

        } catch (error) {

            console.error(
                '❌ Erro fatal no AIService:',
                error
            );

            throw error;

        } finally {

            // =========================================================
            // 15. APAGAR ARQUIVO TEMPORÁRIO DO SERVIDOR
            // =========================================================

            if (
                localFilePath &&
                fs.existsSync(localFilePath)
            ) {

                try {

                    fs.unlinkSync(
                        localFilePath
                    );

                    console.log(
                        '🗑️ Arquivo temporário do servidor removido.'
                    );

                } catch (error) {

                    console.error(
                        '⚠️ Não foi possível remover o arquivo temporário:',
                        error
                    );
                }
            }

            // =========================================================
            // 16. APAGAR ARQUIVO TEMPORÁRIO DO GEMINI
            // =========================================================

            if (uploadedFileName) {

                try {

                    await ai.files.delete({
                        name:
                            uploadedFileName
                    });

                    console.log(
                        '🗑️ Arquivo temporário removido do Gemini.'
                    );

                } catch (error) {

                    console.warn(
                        '⚠️ Não foi possível remover arquivo temporário do Gemini:',
                        error
                    );
                }
            }
        }
    }
}
