// Repete uma chamada que falhou por motivo passageiro (servidor reiniciando por um deploy, outra operação ainda rodando,
// conexão que caiu), esperando mais a cada tentativa, em vez de parar no primeiro erro. Erro que não é passageiro (permissão,
// dado inválido) sobe na hora.
export type RetryOptions = {
  isTransient: (error: unknown) => boolean;
  /** Espera antes de cada nova tentativa, em ms; o tamanho da lista é o número de novas tentativas. */
  waits: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  /** Chamado antes de cada espera e depois dela (true = esperando). */
  onWaiting?: (waiting: boolean) => void;
  /** Se devolver true, desiste sem erro (a tela foi fechada). */
  shouldStop?: () => boolean;
};

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Devolve o resultado, ou `null` se `shouldStop` mandou parar. Lança o último erro quando as tentativas acabam. */
export async function retryTransient<T>(run: () => Promise<T>, options: RetryOptions): Promise<T | null> {
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!options.isTransient(error) || attempt >= options.waits.length) throw error;
      if (options.shouldStop?.()) return null;
      options.onWaiting?.(true);
      try {
        await sleep(options.waits[attempt]);
      } finally {
        options.onWaiting?.(false);
      }
      if (options.shouldStop?.()) return null;
    }
  }
}
