import { AuditService } from '../services/audit.service';

export function recordAiTelemetry(tenantId: string, action: string, interaction: any, metadata?: any): void {
    if (!interaction?.usage) return;
    
    AuditService.record({
        tenantId,
        action: `AI_TELEMETRY_${action.toUpperCase()}`,
        targetType: 'AI_USAGE',
        metadata: {
            totalTokens: interaction.usage.total_tokens,
            promptTokens: interaction.usage.prompt_tokens,
            completionTokens: interaction.usage.completion_tokens,
            ...metadata
        }
    });
}
