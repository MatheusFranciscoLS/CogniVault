import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { COMMERCIAL_PRICE_DIVISOR } from '../scripts/price-list-rules';
import { fetchConsumerPrice, parceiroHusqvarnaConfigured } from '../services/parceiro-husqvarna-client';

// Endpoint de diagnóstico, só para administrador: existe pra você confirmar,
// depois de colar o cookie de sessão no Render, que a consulta ao Portal
// Parceiro está funcionando de verdade — antes de qualquer tela de balcão
// depender disso. Não é chamado por nenhum fluxo de atendimento ainda.
export class ParceiroHusqvarnaController {
    async checkPrice(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;

        if (!parceiroHusqvarnaConfigured()) {
            res.status(503).json({
                error: 'PARCEIRO_HUSQVARNA_COOKIE não está configurada. A consulta de preço fica desligada até essa variável existir no ambiente.',
            });
            return;
        }

        const code = String(req.query.code || '').replace(/\D/g, '');
        if (!/^\d{6,14}$/.test(code)) {
            res.status(400).json({ error: 'Informe um código de peça válido (?code=577484001).' });
            return;
        }

        const consumerPrice = await fetchConsumerPrice(code);
        if (consumerPrice === null) {
            res.status(404).json({
                error: 'Não foi possível ler o preço. A sessão pode ter expirado (cole um cookie novo) ou este código não existe na unidade de negócio padrão.',
            });
            return;
        }

        const ourPrice = Math.round((consumerPrice / COMMERCIAL_PRICE_DIVISOR) * 100) / 100;
        res.json({
            code,
            consumerPrice,
            ourPrice,
            divisor: COMMERCIAL_PRICE_DIVISOR,
        });
    }
}
