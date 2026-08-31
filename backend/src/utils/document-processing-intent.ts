const REEXTRACTION_STAGES = new Set([
    'QUEUED_REEXTRACT',
    'DOWNLOADING',
    'EXTRACTING',
    'AI_EXTRACTION',
]);

/**
 * Um reprocessamento preserva status COMPLETED enquanto a nova revisão é
 * preparada. Se o worker reiniciar depois de QUEUED_REEXTRACT, o estágio pode
 * estar em DOWNLOADING/EXTRACTING; o status preservado mantém a intenção e
 * impede que o snapshot antigo seja reutilizado por engano.
 */
export function shouldForceCatalogReextraction(status: string, processingStage: string): boolean {
    return processingStage === 'QUEUED_REEXTRACT'
        || (status === 'COMPLETED' && REEXTRACTION_STAGES.has(processingStage));
}
