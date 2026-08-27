import { GoogleGenAI } from '@google/genai';
import { prisma } from '../config/prisma';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';

const apiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!apiKey || !supabaseUrl || !supabaseKey) {
    throw new Error('❌ Chaves de API (Gemini ou Supabase) não encontradas no .env');
}

const ai = new GoogleGenAI({ apiKey });
const supabase = createClient(supabaseUrl, supabaseKey);

export class AIService {
    static async processDocument(documentId: string, tenantId: string) {
        console.log(`\n🧠 Iniciando processamento do documento: ${documentId}`);

        const document = await prisma.document.findUnique({ where: { id: documentId } });
        if (!document || !document.url) throw new Error('Documento não encontrado.');

        const localFilePath = document.url; // Caminho no HD (ex: uploads/arquivo)

        // =========================================================
        // 1. UPLOAD PARA O SUPABASE (Armazenamento Permanente)
        // =========================================================
        console.log('☁️ Enviando PDF para o cofre do Supabase...');
        const fileBuffer = fs.readFileSync(localFilePath);
        const fileName = `${documentId}.pdf`; // Nome único para não dar conflito

        const { error: uploadError } = await supabase.storage
            .from('catalogos')
            .upload(fileName, fileBuffer, { contentType: 'application/pdf' });

        if (uploadError) throw new Error(`Erro no Supabase: ${uploadError.message}`);

        // Pega o link público gerado
        const { data: publicUrlData } = supabase.storage
            .from('catalogos')
            .getPublicUrl(fileName);

        const permanentUrl = publicUrlData.publicUrl;

        // Atualiza o banco de dados com a URL definitiva
        await prisma.document.update({
            where: { id: documentId },
            data: { url: permanentUrl }
        });
        console.log('✅ PDF salvo na nuvem! Link gerado e atualizado no banco.');

        // =========================================================
        // 2. LEITURA VISUAL DA IA (Usando o arquivo local para ser mais rápido)
        // =========================================================
        console.log('📤 Enviando para a File API do Gemini...');
        const uploadedFile = await ai.files.upload({
            file: localFilePath,
            config: { mimeType: 'application/pdf' }
        });

        console.log('👁️ IA analisando vistas explodidas e tabelas...');
        const prompt = `
        Você é um especialista em mecânica e catálogos de peças de máquinas (como motosserras, roçadeiras, etc).
        Analise detalhadamente este catálogo em PDF.
        Para CADA página que contenha uma vista explodida e uma tabela, faça o cruzamento visual:
        Identifique o número da peça no desenho, procure esse número na tabela correspondente e extraia o Nome da Peça e o Código do Produto (Part Number).
        
        Gere um relatório muito detalhado de todas as peças encontradas no formato:
        "Seção [Nome da seção, ex: Carburador]: A peça de número [Número no desenho] é o(a) [Nome da Peça]. Seu código de fábrica (Part Number) é [Código]."
        
        Não omita nenhuma peça, extraia o máximo de informações possível para o banco de dados.
        `;

        const visionResponse = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: [uploadedFile, prompt]
        });

        const text = visionResponse.text;
        if (!text) throw new Error('Falha ao extrair dados visuais do PDF.');
        console.log(`📖 Relatório visual gerado com sucesso! Tamanho: ${text.length} caracteres.`);

        // =========================================================
        // 3. LIMPEZA E VETORIZAÇÃO
        // =========================================================
        try {
            fs.unlinkSync(localFilePath); // 🗑️ Apaga do seu HD local (Servidor leve!)
        } catch (err) {
            console.error('Aviso: Não foi possível apagar o arquivo local.');
        }

        if (uploadedFile.name) {
            await ai.files.delete({ name: uploadedFile.name }); // Apaga da nuvem temporária do Google
        }

        console.log('✂️ Dividindo o relatório visual em blocos e vetorizando...');
        const chunks = this.splitText(text, 1000);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            if (!chunk.trim()) continue;

            const result = await ai.models.embedContent({
                model: 'gemini-embedding-001',
                contents: chunk,
                config: { outputDimensionality: 768, taskType: 'RETRIEVAL_DOCUMENT' },
            });

            const embedding = result.embeddings?.[0]?.values;
            if (!embedding || embedding.length !== 768) throw new Error('Embedding inválido.');

            const embeddingString = `[${embedding.join(',')}]`;
            const chunkId = crypto.randomUUID();

            await prisma.$executeRaw`
                INSERT INTO "DocumentChunk" ("id", "documentId", "content", "embedding")
                VALUES (${chunkId}, ${documentId}, ${chunk}, ${embeddingString}::vector)
            `;
        }

        console.log(`🚀 SUCESSO ABSOLUTO! Peças vetorizadas e PDF arquivado na nuvem.`);
    }

    private static splitText(text: string, maxLength: number): string[] {
        const words = text.split(/\s+/);
        const chunks: string[] = [];
        let currentChunk = '';
        for (const word of words) {
            if (currentChunk.length + word.length + 1 > maxLength && currentChunk.trim()) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }
            currentChunk += `${word} `;
        }
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        return chunks;
    }
}