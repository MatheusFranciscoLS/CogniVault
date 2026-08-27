import { prisma } from '../config/prisma';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Pega as chaves de segurança
const apiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY; // 👈 Usando a chave mestra!

if (!apiKey || !supabaseUrl || !supabaseKey) {
    throw new Error('❌ Chaves de API (Gemini ou Supabase) não encontradas no .env');
}

const ai = new GoogleGenAI({ apiKey });
const supabase = createClient(supabaseUrl, supabaseKey);

export class AIService {

    // O "static" garante que o worker consiga chamar sem precisar dar "new AIService()"
    static async processDocument(documentId: string, tenantId: string): Promise<void> {
        try {
            console.log(`\n🧠 Iniciando processamento do documento: ${documentId}`);

            // 1. Busca os dados do documento no banco
            const document = await prisma.document.findUnique({
                where: { id: documentId }
            });

            if (!document) {
                throw new Error('Documento não encontrado no banco de dados.');
            }

            // 2. Define onde o arquivo está salvo temporariamente no backend
            // Assumindo que seu upload controller salva na pasta "uploads" na raiz do backend
            const filename = document.filename || `${documentId}.pdf`;
            const localFilePath = path.resolve(__dirname, `../../uploads/${filename}`);

            if (!fs.existsSync(localFilePath)) {
                throw new Error(`Arquivo não encontrado no servidor: ${localFilePath}`);
            }

            // =========================================================
            // PASSO 1: SALVAR NO SUPABASE E PEGAR O LINK
            // =========================================================
            console.log('☁️ Enviando PDF para o cofre do Supabase...');
            const fileBuffer = fs.readFileSync(localFilePath);

            const { error: uploadError } = await supabase.storage
                .from('catalogs') // <-- Se o seu bucket tiver outro nome, mude aqui!
                .upload(`${tenantId}/${documentId}.pdf`, fileBuffer, {
                    contentType: 'application/pdf',
                    upsert: true
                });

            if (uploadError) {
                throw new Error(`Erro no Supabase: ${uploadError.message}`);
            }

            // Pega o link público e salva no banco
            const { data: publicUrlData } = supabase.storage
                .from('catalogs')
                .getPublicUrl(`${tenantId}/${documentId}.pdf`);

            await prisma.document.update({
                where: { id: documentId },
                data: { url: publicUrlData.publicUrl }
            });

            console.log('✅ PDF salvo na nuvem! Link gerado e atualizado no banco.');

            // =========================================================
            // PASSO 2: LEITURA VISUAL COM O GEMINI
            // =========================================================
            console.log('📤 Enviando para a File API do Gemini...');
            const uploadedFile = await ai.files.upload({
                file: localFilePath,
                mimeType: 'application/pdf'
            });

            console.log('👁️ IA analisando vistas explodidas e tabelas...');
            const prompt = `
            Você é um especialista em mecânica e catálogos de peças de máquinas (como motosserras, roçadeiras, tratores).
            Analise detalhadamente este catálogo em PDF.
            Para CADA página que contenha uma vista explodida e uma tabela, faça o cruzamento visual:
            Identifique o número da peça no desenho, procure esse número na tabela correspondente e extraia o Nome da Peça e o Código do Produto (Part Number).
            
            Gere um relatório detalhado de todas as peças encontradas no formato:
            "Seção [Nome da seção]: A peça de número [Número no desenho] é o(a) [Nome da Peça]. Seu código de fábrica (Part Number) é [Código]."
            
            Extraia absolutamente tudo o que conseguir.
            `;

            const visionResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                fileData: {
                                    fileUri: uploadedFile.uri,
                                    mimeType: uploadedFile.mimeType
                                }
                            },
                            { text: prompt }
                        ]
                    }
                ]
            });

            const text = visionResponse.text;
            if (!text) throw new Error('A IA não conseguiu ler o texto do PDF.');
            console.log(`📖 Relatório visual gerado com sucesso! Tamanho: ${text.length} caracteres.`);

            // =========================================================
            // PASSO 3: FATIAMENTO DO TEXTO (Chunking)
            // =========================================================
            console.log('🔪 Fatiando as informações extraídas...');
            // Quebra o textoão da IA em pedaços menores (parágrafos)
            const chunks = text.split('\n\n').filter(c => c.trim().length > 10);

            // =========================================================
            // PASSO 4: VETORIZAÇÃO MATEMÁTICA (768 Dimensões)
            // =========================================================
            console.log(`🔢 Gerando coordenadas matemáticas para ${chunks.length} peças...`);

            for (const chunk of chunks) {
                const embedResult = await ai.models.embedContent({
                    model: 'text-embedding-004',
                    contents: chunk,
                    config: {
                        outputDimensionality: 768,
                        taskType: 'RETRIEVAL_DOCUMENT' // <-- Formato para quem GUARDS os dados
                    }
                });

                const embedding = embedResult.embeddings?.[0]?.values;
                if (!embedding) continue;

                const embeddingString = `[${embedding.join(',')}]`;

                // Salva o pedaço de texto e a matemática dele no banco de dados!
                await prisma.$executeRaw`
                    INSERT INTO "DocumentChunk" ("id", "documentId", "content", "embedding")
                    VALUES (gen_random_uuid(), ${documentId}, ${chunk}, ${embeddingString}::vector)
                `;
            }

            console.log('\n🏆 SUCESSO ABSOLUTO! Catálogo processado, vetorizado e salvo!');

            // (Opcional) Limpar o arquivo da pasta uploads para economizar disco
            if (fs.existsSync(localFilePath)) {
                fs.unlinkSync(localFilePath);
                console.log('🗑️ Arquivo temporário local apagado.');
            }

        } catch (error) {
            console.error(`❌ Erro fatal no AIService:`, error);
            throw error; // Joga o erro para o Worker marcar como FAILED no banco
        }
    }
}