import { prisma } from '../config/prisma';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';

/**
 * Guarda o que já foi lido do catálogo oficial do fabricante, para virar busca.
 *
 * **O buraco que isto fecha.** Abrir um motor Briggs no atendimento baixa o PDF
 * e lê até 283 peças com código, posição e descrição — e até aqui tudo isso ia
 * para um cache opaco, que só sabe responder *"quais as peças do motor X"*.
 * O caminho contrário não existia: o cliente chega com a peça na mão e o código
 * `592358`, o atendente digita, e **não acha nada** — mesmo o sistema tendo lido
 * esse código dez minutos antes.
 *
 * O fluxo só andava num sentido (máquina → peça). Agora anda nos dois, e cada
 * atendimento deixa a busca mais forte para o próximo, sem gastar nada: o dado
 * já foi baixado, só não era guardado.
 *
 * **Procedência.** Estes códigos vêm da fonte oficial do fabricante — evidência
 * mais forte que a extração de PDF, e nada aqui passa por IA. Mesmo assim a
 * tabela é separada de `Part`, que pertence a um `Document` que a loja subiu e
 * tem ciclo de vida próprio (`active`, reprocessamento). Misturar as duas faria
 * a tela perder a diferença entre "o fabricante publica" e "extraímos de um PDF
 * daqui", que é justamente o que sustenta a regra de nunca chutar código.
 */
export type IndexablePart = {
  partNumber: string;
  name: string;
  position?: string | null;
  assembly?: string | null;
  quantity?: number | null;
};

export type OfficialPartSource = 'BRIGGS' | 'KAWASAKI';

export type OfficialPartHit = {
  source: OfficialPartSource;
  engineModel: string;
  assembly: string | null;
  position: string | null;
  partNumber: string;
  name: string;
  quantity: number | null;
  readAt: Date;
};

export class OfficialPartIndexService {
  /**
   * Grava o que a leitura do catálogo devolveu.
   *
   * **Nunca lança.** É efeito colateral de uma consulta do balcão: se o banco
   * estiver indisponível, o atendente tem que continuar vendo a lista de peças
   * na tela. Falhar aqui derrubaria o atendimento por causa de um índice.
   */
  static async record(
    source: OfficialPartSource,
    engineModel: string,
    parts: IndexablePart[],
  ): Promise<void> {
    const normalizedEngine = normalizeIdentifier(engineModel);
    if (!normalizedEngine || !parts.length) return;

    try {
      // `upsert` em vez de `createMany`: a mesma peça é relida a cada renovação
      // do cache, e o que interessa é a versão mais nova, não uma linha por
      // leitura. Sequencial de propósito — são 283 linhas no pior caso, uma vez
      // a cada 30 dias por motor, e o Render free tem pool de conexão pequeno.
      for (const part of parts) {
        const normalizedNumber = normalizeIdentifier(part.partNumber);
        if (normalizedNumber.length < 4) continue;

        const position = (part.position || '').trim();
        const data = {
          source,
          engineModel,
          normalizedEngine,
          assembly: part.assembly || null,
          position,
          partNumber: part.partNumber,
          normalizedNumber,
          name: part.name,
          normalizedName: normalizeText(part.name),
          quantity: part.quantity ?? null,
          readAt: new Date(),
        };

        await prisma.officialPartIndex.upsert({
          where: {
            source_normalizedEngine_normalizedNumber_position: {
              source,
              normalizedEngine,
              normalizedNumber,
              position,
            },
          },
          create: data,
          update: data,
        });
      }
    } catch (error) {
      console.warn(
        `[Índice oficial] Não foi possível gravar as peças de "${engineModel}" (${source}):`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * De que motor é este código.
   *
   * A mesma peça pode aparecer em vários motores (parafuso, junta), e isso é
   * informação, não ruído: dizer ao balcão que o código serve em três motores
   * evita a devolução por peça trocada. Por isso devolve lista, não o primeiro.
   */
  static async byCode(code: string, limit = 12): Promise<OfficialPartHit[]> {
    const normalizedNumber = normalizeIdentifier(code);
    if (normalizedNumber.length < 4) return [];

    try {
      const rows = await prisma.officialPartIndex.findMany({
        where: { normalizedNumber },
        orderBy: [{ readAt: 'desc' }],
        take: limit,
      });

      return rows.map(row => ({
        source: row.source as OfficialPartSource,
        engineModel: row.engineModel,
        assembly: row.assembly,
        position: row.position || null,
        partNumber: row.partNumber,
        name: row.name,
        quantity: row.quantity,
        readAt: row.readAt,
      }));
    } catch (error) {
      console.warn(
        '[Índice oficial] Consulta indisponível:',
        error instanceof Error ? error.message : error,
      );
      return [];
    }
  }
}
