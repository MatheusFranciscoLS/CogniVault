import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { ChatService, type ChatSearchResult } from '../services/chat.service';
import { extractLikelyPartNumber } from '../services/chat-reliability';
import { OfficialPartVerificationService } from '../services/official-part-verification.service';
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

function sameTechnicalApplication(left: ChatSearchResult['part'], right: ChatSearchResult['part']): boolean {
    if (!left || !right) return false;
    if (normalizeIdentifier(left.model) !== normalizeIdentifier(right.model)) return false;
    if (left.pnc === 'Qualquer um' || right.pnc === 'Qualquer um') return true;
    return normalizeIdentifier(left.pnc) === normalizeIdentifier(right.pnc);
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
            const requestedCode = cleanSelectedPartId ? null : extractLikelyPartNumber(cleanQuestion);
            const requestedVerification = requestedCode
                ? await OfficialPartVerificationService.resolveCurrentCode(req.user.tenantId, requestedCode)
                : null;

            const effectiveQuestion = requestedVerification?.state === 'SUPERSEDED'
                ? requestedVerification.currentPartNumber
                : cleanQuestion;

            let result = await ChatService.askQuestion(req.user.tenantId, effectiveQuestion, cleanPnc, cleanSelectedPartId);

            if (requestedVerification?.state === 'SUPERSEDED') {
                if (result.status === 'FOUND') {
                    result = prependOfficialNotice(result, requestedVerification.queriedPartNumber, requestedVerification.currentPartNumber);
                } else {
                    result = {
                        ...result,
                        answer: `Verificação oficial: o código ${requestedVerification.queriedPartNumber} foi substituído por ${requestedVerification.currentPartNumber} no Portal Husqvarna. O código atual ainda não foi localizado em um catálogo técnico ativo deste tenant; confirme a aplicação no portal antes de concluir.\n${result.answer}`,
                    };
                }
            } else if (!cleanSelectedPartId && result.status === 'FOUND' && result.part) {
                const foundVerification = await OfficialPartVerificationService.resolveCurrentCode(req.user.tenantId, result.part.partNumber);
                if (foundVerification.state === 'SUPERSEDED') {
                    const currentResult = await ChatService.askQuestion(req.user.tenantId, foundVerification.currentPartNumber, cleanPnc);
                    if (currentResult.status === 'FOUND' && sameTechnicalApplication(result.part, currentResult.part)) {
                        result = prependOfficialNotice(currentResult, foundVerification.queriedPartNumber, foundVerification.currentPartNumber);
                    } else {
                        result = {
                            ...result,
                            answer: `Existe uma substituição oficial ${foundVerification.queriedPartNumber} → ${foundVerification.currentPartNumber}, mas o CogniVault não conseguiu confirmar a mesma aplicação de modelo/PNC nesta consulta. Revise no portal antes de concluir.\n${result.answer}`,
                        };
                    }
                }
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
