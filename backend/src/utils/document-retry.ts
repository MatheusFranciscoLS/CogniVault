import { isDailyAIQuotaError, isTransientAIError } from './ai-retry';

const DEFAULT_MAX_DOCUMENT_RETRIES = 3;

function maxDocumentRetries(): number {
    const configured = Number(process.env.AI_DOCUMENT_MAX_RETRIES || DEFAULT_MAX_DOCUMENT_RETRIES);
    return Number.isFinite(configured)
        ? Math.min(5, Math.max(0, Math.trunc(configured)))
        : DEFAULT_MAX_DOCUMENT_RETRIES;
}

export function documentRetryCount(headers: unknown): number {
    if (!headers || typeof headers !== 'object') {
        return 0;
    }

    const value = (headers as Record<string, unknown>)['x-retry-count'];
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export function nextDocumentRetry(error: unknown, headers: unknown): number | null {
    // Uma cota diária não ficará disponível 60 segundos depois. Reenfileirar esse
    // erro só faz o catálogo alternar entre EXTRAINDO e AGUARDANDO IA por minutos.
    if (isDailyAIQuotaError(error) || !isTransientAIError(error)) {
        return null;
    }

    const currentRetry = documentRetryCount(headers);
    return currentRetry < maxDocumentRetries() ? currentRetry + 1 : null;
}

