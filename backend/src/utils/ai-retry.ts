interface RetryOptions {
    label: string;
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (message: string) => void;
}

const TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const TRANSIENT_ERROR_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'ENETUNREACH',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET',
    'RESOURCE_EXHAUSTED',
    'UNAVAILABLE',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function asStatus(value: unknown): number | null {
    const status = typeof value === 'number' ? value : Number(value);
    return Number.isInteger(status) ? status : null;
}

function errorRecords(error: unknown): Record<string, unknown>[] {
    const records: Record<string, unknown>[] = [];
    const queue: unknown[] = [error];
    const visited = new Set<unknown>();

    while (queue.length && records.length < 40) {
        const current = queue.shift();
        if (!isRecord(current) || visited.has(current)) continue;
        visited.add(current);
        records.push(current);

        queue.push(current.cause, current.error, current.response);
        for (const key of ['details', 'violations']) {
            const nested = current[key];
            if (Array.isArray(nested)) queue.push(...nested.slice(0, 20));
        }
    }

    return records;
}

function errorStatus(error: unknown): number | null {
    for (const record of errorRecords(error)) {
        const status = asStatus(record.status ?? record.statusCode);
        if (status !== null) return status;

        // A API do Gemini usa error.code como status HTTP numérico.
        const apiCode = asStatus(record.code);
        if (apiCode !== null && apiCode >= 100) return apiCode;
    }

    return null;
}

function errorCodes(error: unknown): string[] {
    const codes: string[] = [];
    for (const record of errorRecords(error)) {
        for (const value of [record.code, record.status]) {
            if (typeof value === 'string') codes.push(value.toUpperCase());
        }
    }

    return codes;
}

function errorMessage(error: unknown): string {
    const messages: string[] = [];
    for (const record of errorRecords(error)) {
        if (typeof record.message === 'string') messages.push(record.message);
    }

    return messages.length ? messages.join(' | ') : String(error);
}

function configuredAttempts(): number {
    const parsed = Number(process.env.AI_TRANSIENT_MAX_ATTEMPTS || '4');
    return Number.isFinite(parsed) ? Math.min(6, Math.max(1, Math.trunc(parsed))) : 4;
}

function wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function isTransientAIError(error: unknown): boolean {
    const status = errorStatus(error);
    if (status !== null && TRANSIENT_STATUS_CODES.has(status)) {
        return true;
    }

    if (errorCodes(error).some((code) => TRANSIENT_ERROR_CODES.has(code))) {
        return true;
    }

    const message = errorMessage(error).toLowerCase();
    return [
        'high demand',
        'please try again later',
        'rate limit',
        'resource exhausted',
        'service unavailable',
        'temporarily unavailable',
        'timed out',
        'timeout',
    ].some((fragment) => message.includes(fragment));
}

export function retryDelayMs(error: unknown): number | null {
    for (const record of errorRecords(error)) {
        if (typeof record.retryDelay === 'string') {
            const seconds = Number.parseFloat(record.retryDelay.replace(/s$/i, ''));
            if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
        }

        const details = Array.isArray(record.details) ? record.details : [];
        for (const detail of details) {
            if (!isRecord(detail) || typeof detail.retryDelay !== 'string') continue;
            const seconds = Number.parseFloat(detail.retryDelay.replace(/s$/i, ''));
            if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
        }
    }

    const message = errorMessage(error);
    const match = message.match(/retry(?:\s+in\s+|Delay["']?\s*:\s*["']?)([\d.]+)s/i);
    if (!match) return null;
    const seconds = Number.parseFloat(match[1]);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1_000) : null;
}

export function isDailyAIQuotaError(error: unknown): boolean {
    const signals: string[] = [errorMessage(error)];
    for (const record of errorRecords(error)) {
        for (const value of [record.quotaId, record.quotaMetric]) {
            if (typeof value === 'string') signals.push(value);
        }
    }

    const combined = signals.join(' ').toLowerCase();
    return combined.includes('perday')
        || combined.includes('per day')
        || combined.includes('daily quota');
}

export async function withTransientAIRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions,
): Promise<T> {
    const maxAttempts = options.maxAttempts ?? configuredAttempts();
    const baseDelayMs = Math.max(0, options.baseDelayMs ?? 2_000);
    const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 65_000);
    const onRetry = options.onRetry ?? ((message: string) => console.warn(message));

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (isDailyAIQuotaError(error) || !isTransientAIError(error) || attempt >= maxAttempts) {
                throw error;
            }

            const requestedDelayMs = retryDelayMs(error) ?? 0;
            const exponentialDelayMs = baseDelayMs * (2 ** (attempt - 1));
            const delayMs = Math.min(maxDelayMs, Math.max(requestedDelayMs, exponentialDelayMs));
            onRetry(
                `⏳ ${options.label}: indisponibilidade temporária da IA; nova tentativa ${attempt + 1}/${maxAttempts} em ${delayMs} ms.`,
            );
            await wait(delayMs);
        }
    }

    throw new Error(`Não foi possível concluir ${options.label}.`);
}
