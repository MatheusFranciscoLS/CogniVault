import { isDailyAIQuotaError, isTransientAIError } from './ai-retry';

function fallbackMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : (typeof error === 'string' ? error : '');
    const trimmed = message.trim();
    if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return 'O processamento não pôde ser concluído. Tente novamente mais tarde.';
    }
    return trimmed.slice(0, 360);
}

export function readableProcessingError(
    error: unknown,
    hasUsableCatalog: boolean,
    retryScheduled = false,
): string {
    if (isDailyAIQuotaError(error)) {
        return hasUsableCatalog
            ? 'As peças já gravadas foram preservadas. A cota diária da IA foi atingida; o catálogo continua disponível e o índice opcional pode ser retomado após a renovação da cota.'
            : 'Este PDF precisa de leitura visual pela IA. A cota diária do modelo foi atingida; aguarde a renovação da cota e use “Tentar novamente”. O PDF original foi preservado.';
    }

    if (isTransientAIError(error)) {
        if (hasUsableCatalog) {
            return retryScheduled
                ? 'As peças já gravadas continuam disponíveis. A IA está temporariamente indisponível e uma nova tentativa automática foi agendada.'
                : 'As peças já gravadas continuam disponíveis. A IA permaneceu temporariamente indisponível após as tentativas automáticas; tente novamente mais tarde se quiser concluir a etapa opcional.';
        }
        return retryScheduled
            ? 'A IA está com alta demanda ou temporariamente indisponível. Uma nova tentativa automática foi agendada; não é necessário reenviar o PDF.'
            : 'A IA permaneceu indisponível após as tentativas automáticas. O PDF foi preservado; use “Tentar novamente” mais tarde.';
    }

    return fallbackMessage(error);
}
