export const GEMINI_GENERATIVE_MODEL = process.env.GEMINI_GENERATIVE_MODEL?.trim() || 'gemini-3.7-flash';

function apiKey(): string {
    const value = process.env.GEMINI_API_KEY?.trim();
    if (!value) throw new Error('GEMINI_API_KEY não definida. A busca textual continua disponível.');
    return value;
}

async function loadGenAi() {
    return import('@google/genai');
}

async function createGeminiClient() {
    const { GoogleGenAI } = await loadGenAi();
    return new GoogleGenAI({ apiKey: apiKey() });
}

let clientPromise: ReturnType<typeof createGeminiClient> | null = null;

export function getGeminiClient() {
    clientPromise ??= createGeminiClient();
    return clientPromise;
}

export async function getGeminiType() {
    const { Type } = await loadGenAi();
    return Type;
}
