import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { ChatService, type ChatSearchResult } from '../services/chat.service';
import { buildFallbackIntent, extractLikelyPartNumber } from '../services/chat-reliability';
import { OfficialPartVerificationService, type OfficialVerificationView } from '../services/official-part-verification.service';
import { requiresSerialConfirmation, type SerialGuidanceCandidate } from '../services/serial-guidance';
import { normalizeIdentifier } from '../utils/normalize';

type GuidedChatSearchResult = ChatSearchResult & { serialRequired?: boolean };

function prependOfficialNotice(result: ChatSearchResult, previousCode: string, currentCode: string): ChatSearchResult {
    const notice = `Verificação oficial: o código ${previousCode} foi substituído por ${currentCode} no Portal Husqvarna.`;
    return {
        ...result,
        answer: `${notice}\n${result.answer}`,
        match: result.match ? {
            ...result.match,
            explanation: `${result.match.explanation} ${notice}`,
        } : result.match,
    };
}

function prependReviewNotice(result: ChatSearchResult, verification: OfficialVerificationView): ChatSearchResult {
    return {
        ...result,
        answer: `A verificação oficial do código ${verification.queriedPartNumber} está marcada como “Precisa de revisão”. Confirme no Portal Husqvarna antes de concluir.\n${result.answer}`,
    };
}

function addVerifiedExplanation(result: ChatSearchResult, verification: OfficialVerificationView): ChatSearchResult {
    if (!result.match) return result;
    return {
        ...result,
        match: {
            ...result.match,
            explanation: `${result.match.explanation} O código ${verification.currentPartNumber} também possui confirmação oficial registrada para esta empresa.`,
        },
    };
}

function sameTechnicalApplication(left: ChatSearchResult['part'], right: ChatSearchResult['part']): boolean {
    if (!left || !right) return false;
    if (normalizeIdentifier(left.model) !== normalizeIdentifier(right.model)) return false;
    if (left.pnc === 'Qualquer um' || right.pnc === 'Qualquer um') return true;
    return normalizeIdentifier(left.pnc) === normalizeIdentifier(right.pnc);
}

function matchesRequestedContext(part: ChatSearchResult['part'], question: string, explicitPnc?: string): boolean {
    if (!part) return false;
    const intent = buildFallbackIntent(question);
    const requestedModel = normalizeIdentifier(intent.model);
    if (requestedModel && normalizeIdentifier(part.model) !== requestedModel) return false;

    const requestedPnc = normalizeIdentifier(explicitPnc || intent.pnc);
    if (requestedPnc && part.pnc !== 'Qualquer um' && normalizeIdentifier(part.pnc) !== requestedPnc) return false;
    return true;
}

function serialCandidates(result: ChatSearchResult): SerialGuidanceCandidate[] {
    const candidates: SerialGuidanceCandidate[] = [];
    if (result.part) {
        candidates.push({
            partNumber: result.part.partNumber,
            pnc: result.part.pnc,
            section: result.part.section,
            position: result.part.position,
            notes: result.part.notes,
        });
    }
    for (const option of [...(result.options || []), ...(result.feedbackOptions || [])]) {
        candidates.push({
            partNumber: option.partNumber,
            pnc: option.pnc,
            section: option.section,
            position: option.position,
            notes: option.notes,
        });
    }

    const seen = new Set<string>();
    return candidates.filter(candidate => {
        const key = [candidate.partNumber, candidate.pnc, candidate.section, candidate.position, candidate.notes].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Última barreira antes de devolver a resposta ao cliente. Mesmo que algum
 * recuperador/ranker coloque uma variante em primeiro, o código é removido se a
 * própria base demonstra troca por S/N no mesmo PNC/vista/posição e o usuário
 * ainda não informou o número de série.
 */
function enforceSerialConfirmation(result: ChatSearchResult, question: string, manualSelection: boolean): GuidedChatSearchResult {
    if (manualSelection || result.status === 'PNC_REQUIRED' || result.status === 'MODEL_REQUIRED') return result;
    const candidates = serialCandidates(result);
    if (!requiresSerialConfirmation(question, candidates)) return result;

    return {
        ...result,
        status: 'AMBIGUOUS',
        serialRequired: true,
        part: undefined,
        options: undefined,
        feedbackOptions: undefined,
        answer: 'Este item possui códigos diferentes conforme o número de série. Informe o S/N (número de série) da etiqueta da máquina para eu escolher a variante correta sem arriscar o código.',
        match: result.match ? {
            ...result.match,
            level: 'REVIEW',
            explanation: 'O CogniVault detectou uma troca de código explicitamente condicionada por número de série e bloqueou a resposta até a identificação da máquina ser completada.',
            evidence: [...(result.match.evidence || []), 'O mesmo PNC/vista/posição possui códigos diferentes separados por faixas explícitas de S/N.'],
        } : result.match,
        guidance: {
            title: 'Número de série necessário',
            description: 'O PNC sozinho não distingue as variantes deste item. A fronteira de aplicação está escrita no catálogo por S/N.',
            tips: ['Localize S/N ou Serial Number na etiqueta da máquina.', 'Digite a consulta novamente acrescentando, por exemplo: “S/N 20240200001”.'],
        },
    };
}

export class ChatController {
    async ask(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({ error: 'Usuário não autenticado.' });
                return;
            }

            const { question, pnc, selectedPartId } = req.body;

            if (typeof question !== 'string' || !question.trim()) {
                res.status(400).json({ error: 'A pergunta não pode estar vazia.' });
                return;
            }

            if (pnc !== undefined && typeof pnc !== 'string') {
                res.status(400).json({ error: 'PNC inválido.' });
                return;
            }

            if (selectedPartId !== undefined && (typeof selectedPartId !== 'string' || !selectedPartId.trim() || selectedPartId.length > 100)) {
                res.status(400).json({ error: 'Seleção de peça inválida.' });
                return;
            }

            const cleanQuestion = question.trim();
            const cleanPnc = typeof pnc === 'string' ? pnc.trim() : undefined;
            const cleanSelectedPartId = typeof selectedPartId === 'string' ? selectedPartId.trim() : undefined;

            let fallbackModel: string | undefined;
            const quickIntent = buildFallbackIntent(cleanQuestion);
            if (!quickIntent.model && !cleanSelectedPartId) {
                try {
                    const recent = await prisma.searchHistory.findFirst({
                        where: {
                            tenantId: req.user.tenantId,
                            userId: req.user.id,
                            resultModel: { not: null },
                            createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
                        },
                        orderBy: { createdAt: 'desc' },
                        select: { resultModel: true },
                    });
                    if (recent?.resultModel) {
                        fallbackModel = recent.resultModel;
                    }
                } catch {
                    // Histórico indisponível não deve bloquear
                }
            }

            let result: GuidedChatSearchResult = await ChatService.askQuestion(
                req.user.tenantId,
                cleanQuestion,
                cleanPnc,
                cleanSelectedPartId,
                fallbackModel,
            );
            result = enforceSerialConfirmation(result, cleanQuestion, Boolean(cleanSelectedPartId));

            try {
                const requestedCode = cleanSelectedPartId ? '' : extractLikelyPartNumber(cleanQuestion);
                const verificationCode = requestedCode || (result.status === 'FOUND' ? result.part?.partNumber || '' : '');

                if (verificationCode) {
                    const verification = await OfficialPartVerificationService.resolveCurrentCode(req.user.tenantId, verificationCode);

                    if (verification.state === 'SUPERSEDED') {
                        const currentCode = normalizeIdentifier(verification.currentPartNumber);
                        const resultCode = normalizeIdentifier(result.part?.partNumber);

                        if (result.status === 'FOUND' && resultCode === currentCode) {
                            result = prependOfficialNotice(result, verification.queriedPartNumber, verification.currentPartNumber);
                        } else {
                            const currentResult = await ChatService.askQuestion(req.user.tenantId, verification.currentPartNumber, cleanPnc);

                            if (currentResult.status === 'FOUND' && currentResult.part) {
                                const technicallyCompatible = result.status === 'FOUND' && result.part
                                    ? sameTechnicalApplication(result.part, currentResult.part)
                                    : matchesRequestedContext(currentResult.part, cleanQuestion, cleanPnc);

                                if (technicallyCompatible) {
                                    result = prependOfficialNotice(currentResult, verification.queriedPartNumber, verification.currentPartNumber);
                                } else {
                                    result = {
                                        ...result,
                                        answer: `Existe uma substituição oficial ${verification.queriedPartNumber} → ${verification.currentPartNumber}, mas o CogniVault não confirmou a mesma aplicação de modelo/PNC nesta consulta. Revise no Portal Husqvarna antes de concluir.\n${result.answer}`,
                                    };
                                }
                            } else {
                                result = {
                                    ...result,
                                    answer: `Verificação oficial: ${verification.queriedPartNumber} → ${verification.currentPartNumber}. O código atual ainda não foi localizado em um catálogo técnico ativo desta empresa; confirme a aplicação no portal antes de concluir.\n${result.answer}`,
                                };
                            }
                        }
                    } else if (verification.state === 'VERIFIED' && result.status === 'FOUND') {
                        result = addVerifiedExplanation(result, verification);
                    } else if (verification.state === 'REVIEW' && result.status === 'FOUND') {
                        result = prependReviewNotice(result, verification);
                    }
                }
            } catch (verificationError) {
                console.warn(
                    '⚠️ Verificação oficial indisponível nesta consulta; mantendo resultado técnico original.',
                    verificationError instanceof Error ? verificationError.message : verificationError,
                );
            }

            await prisma.searchHistory.create({
                data: {
                    tenantId: req.user.tenantId,
                    userId: req.user.id,
                    query: cleanQuestion,
                    pnc: cleanPnc || undefined,
                    status: result.serialRequired ? 'SERIAL_REQUIRED' : result.status,
                    resultPartId: result.part?.id,
                    resultLabel: result.part?.name,
                    resultCode: result.part?.partNumber,
                    resultModel: result.part?.model,
                    resultPnc: result.part?.pnc,
                    sourceFilename: result.part?.filename,
                },
            });

            res.status(200).json(result);
        } catch (error) {
            console.error('❌ Erro no Chat:', error);
            res.status(500).json({ error: 'Erro interno ao processar a pergunta.' });
        }
    }
}
