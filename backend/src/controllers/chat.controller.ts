import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { ChatService, type ChatSearchResult } from '../services/chat.service';
import { buildFallbackIntent, extractLikelyPartNumber } from '../services/chat-reliability';
import { OfficialPartVerificationService, type OfficialVerificationView } from '../services/official-part-verification.service';
import { normalizeIdentifier } from '../utils/normalize';

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
            let result = await ChatService.askQuestion(req.user.tenantId, cleanQuestion, cleanPnc, cleanSelectedPartId);

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
                    status: result.status,
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
