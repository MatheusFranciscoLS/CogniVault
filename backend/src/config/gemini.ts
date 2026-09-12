export const GEMINI_GENERATIVE_MODEL = process.env.GEMINI_GENERATIVE_MODEL?.trim() || 'gemini-3.7-flash';
export const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001';

export function geminiRequestTimeoutMs(raw = process.env.GEMINI_REQUEST_TIMEOUT_MS): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 180_000;
    return Math.min(300_000, Math.max(30_000, Math.round(parsed)));
}

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
    return new GoogleGenAI({
        apiKey: apiKey(),
        httpOptions: { timeout: geminiRequestTimeoutMs() },
    });
}

let clientPromise: ReturnType<typeof createGeminiClient> | null = null;

export function getGeminiClient() {
    clientPromise ??= createGeminiClient();
    return clientPromise;
}
