const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    throw new Error('GEMINI_API_KEY não definida.');
}

async function loadGenAi() {
    return import('@google/genai');
}

async function createGeminiClient() {
    const { GoogleGenAI } = await loadGenAi();
    return new GoogleGenAI({ apiKey });
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
