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

function errorStatus(error: unknown): number | null {
    if (!isRecord(error)) {
        return null;
    }

    const directStatus = asStatus(error.status ?? error.statusCode);
    if (directStatus !== null) {
        return directStatus;
    }

    if (isRecord(error.response)) {
        const responseStatus = asStatus(error.response.status);
        if (responseStatus !== null) {
            return responseStatus;
        }
    }

    if (isRecord(error.error)) {
        return asStatus(error.error.code);
    }

    return null;
}

function errorCode(error: unknown): string {
    if (!isRecord(error)) {
        return '';
    }

    const code = error.code;
    if (typeof code === 'string') {
        return code.toUpperCase();
    }

    if (isRecord(error.error) && typeof error.error.status === 'string') {
        return error.error.status.toUpperCase();
    }

    return '';
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (isRecord(error) && typeof error.message === 'string') {
        return error.message;
    }

    return String(error);
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

    const code = errorCode(error);
    if (TRANSIENT_ERROR_CODES.has(code)) {
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

export async function withTransientAIRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions,
): Promise<T> {
    const maxAttempts = options.maxAttempts ?? configuredAttempts();
    const baseDelayMs = Math.max(0, options.baseDelayMs ?? 2_000);
    const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 15_000);
    const onRetry = options.onRetry ?? ((message: string) => console.warn(message));

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (!isTransientAIError(error) || attempt >= maxAttempts) {
                throw error;
            }

            const delayMs = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
            onRetry(
                `⏳ ${options.label}: indisponibilidade temporária da IA; nova tentativa ${attempt + 1}/${maxAttempts} em ${delayMs} ms.`,
            );
            await wait(delayMs);
        }
    }

    throw new Error(`Não foi possível concluir ${options.label}.`);
}

