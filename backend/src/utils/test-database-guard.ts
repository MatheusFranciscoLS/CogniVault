/**
 * Decide se a suíte de testes pode rodar contra o banco configurado.
 *
 * **Por que isto existe.** O `.env` desta base aponta para o Supabase de
 * PRODUÇÃO, e o Prisma carrega esse arquivo sozinho. `npm test` sempre rodou
 * contra ele, sem ninguém perceber — o `CLAUDE.md` chegou a dizer que não havia
 * `DATABASE_URL` no ambiente de desenvolvimento, o que era falso.
 *
 * O custo apareceu de duas formas, ambas no mesmo dia:
 *
 * - um teste "com o banco fora" não simulava falha nenhuma: a consulta
 *   funcionava, devolvia vazio, e o `catch` nunca era exercitado (verde falso);
 * - o teste de `OfficialPartIndexService.record` chamava `upsert` de verdade, e
 *   deixou duas linhas inventadas em `OfficialPartIndex` na produção — entre
 *   elas um pareamento Kawasaki peça→motor fictício com a procedência "oficial",
 *   exatamente o dado que o produto jura nunca mostrar.
 *
 * A trava é por **sufixo de host conhecido como hospedado**, não por lista de
 * hosts permitidos: o CI usa `localhost`, e uma lista de permitidos quebraria
 * `host.docker.internal`, nome de serviço de container e afins sem proteger
 * nada a mais.
 *
 * Escape explícito para quem sabe o que está fazendo:
 * `ALLOW_PRODUCTION_DB_TESTS=1`. Existe de propósito — uma trava sem saída é
 * contornada de formas piores.
 */
export type TestDatabaseVerdict = {
  allowed: boolean;
  /** Frase pronta para o terminal. Nunca contém a URL, usuário ou senha. */
  reason: string;
};

const HOSTED_SUFFIXES = [
  'supabase.co',
  'supabase.com',
  'render.com',
  'neon.tech',
  'rds.amazonaws.com',
];

function hostedSuffix(host: string): string | null {
  for (const suffix of HOSTED_SUFFIXES) {
    // `=== suffix` cobre o domínio puro; `endsWith('.' + suffix)` exige o ponto
    // para que `naosupabase.com` e `supabase.com.atacante.net` não casem.
    if (host === suffix || host.endsWith(`.${suffix}`)) return suffix;
  }
  return null;
}

export function judgeTestDatabase(
  databaseUrl: string | undefined,
  allowOverride = false,
): TestDatabaseVerdict {
  // Sem URL, nada a proteger: os testes que precisam de banco falham sozinhos
  // com a mensagem do Prisma, que é a mesma de sempre no sandbox.
  if (!databaseUrl) return { allowed: true, reason: 'DATABASE_URL não definida.' };

  let host: string;
  try {
    host = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    // Não imprime o valor: pode conter senha.
    return {
      allowed: false,
      reason: 'DATABASE_URL não é uma URL válida; recusando por não saber para onde apontaria.',
    };
  }

  const suffix = hostedSuffix(host);
  if (!suffix) return { allowed: true, reason: 'Banco local.' };

  if (allowOverride) {
    return {
      allowed: true,
      reason: `Banco hospedado (${suffix}) liberado por ALLOW_PRODUCTION_DB_TESTS=1.`,
    };
  }

  return {
    allowed: false,
    reason:
      `DATABASE_URL aponta para um banco hospedado (${suffix}). A suíte lê e grava no banco, ` +
      'então rodá-la aqui mexeria nos dados de produção. Use um PostgreSQL descartável ' +
      '(veja "Validar migração e endpoints sem tocar em produção" no CLAUDE.md) ou, ' +
      'sabendo o que faz, defina ALLOW_PRODUCTION_DB_TESTS=1.',
  };
}
