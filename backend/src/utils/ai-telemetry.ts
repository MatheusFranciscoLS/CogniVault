import { AuditService } from '../services/audit.service';

export type AiUsage = {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
};

function positiveNumber(...values: unknown[]): number {
    for (const value of values) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed);
    }
    return 0;
}

/**
 * A SDK já expôs usage tanto em snake_case quanto em camelCase entre versões.
 * Centralizar a leitura evita que o orçamento gratuito deixe de contabilizar
 * tokens silenciosamente após uma atualização de dependência.
 */
export function extractAiUsage(interaction: any): AiUsage {
    const usage = interaction?.usage || interaction?.usageMetadata || interaction?.usage_metadata || {};
    const promptTokens = positiveNumber(
        usage.prompt_tokens,
        usage.promptTokens,
        usage.input_tokens,
        usage.inputTokens,
        usage.promptTokenCount,
    );
    const completionTokens = positiveNumber(
        usage.completion_tokens,
        usage.completionTokens,
        usage.output_tokens,
        usage.outputTokens,
        usage.candidatesTokenCount,
    );
    const totalTokens = positiveNumber(
        usage.total_tokens,
        usage.totalTokens,
        usage.totalTokenCount,
        promptTokens + completionTokens,
    );
    return { totalTokens, promptTokens, completionTokens };
}

export function recordAiTelemetry(tenantId: string, action: string, interaction: any, metadata?: any): void {
    const usage = extractAiUsage(interaction);
    if (!usage.totalTokens && !usage.promptTokens && !usage.completionTokens) return;

    void AuditService.record({
        tenantId,
        action: `AI_TELEMETRY_${action.toUpperCase()}`,
        targetType: 'AI_USAGE',
        metadata: {
            totalTokens: usage.totalTokens,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            ...metadata,
        },
    });
}
