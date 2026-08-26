import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

async function main() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error('GEMINI_API_KEY não encontrada.');
    }

    console.log(
        `🔑 Chave encontrada: ${apiKey.substring(0, 6)}...`
    );

    const ai = new GoogleGenAI({
        apiKey,
    });

    const result = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: 'Teste de embedding do CogniVault',
        config: {
            outputDimensionality: 768,
            taskType: 'RETRIEVAL_DOCUMENT',
        },
    });

    console.log(
        '✅ Embedding gerado com sucesso!'
    );

    console.log(
        `📐 Dimensões: ${result.embeddings?.[0]?.values?.length}`
    );
}

main().catch((error) => {
    console.error('❌ Erro:', error);
    process.exit(1);
});