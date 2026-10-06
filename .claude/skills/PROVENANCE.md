# Procedência dos skills

Skill é instrução que o agente passa a seguir. Um skill ruim ou comprometido é
injeção de instrução com acesso às ferramentas, então **nenhum entra sem leitura
integral e sem versão fixada**. Não se instala com `npx skills add` de terceiros:
copia-se o arquivo lido, aqui, por PR.

Cada skill carrega a descrição no contexto de **toda** sessão. Mantenha poucos.

| Skill | Origem | Versão (commit) | Licença | Revisado | Alterado? |
|---|---|---|---|---|---|
| `frontend-design` | `anthropics/skills` · `skills/frontend-design` | `683bc88e56f3` (2026-10-05) | Apache-2.0 | 2026-10-06 | Não |
| `web-design-guidelines` | `vercel-labs/agent-skills` · `skills/web-design-guidelines` + `vercel-labs/web-interface-guidelines` · `command.md` | `063bee94c3f4` + `434b7f913646` | MIT | 2026-10-06 | **Sim** (ver abaixo) |
| `supabase-postgres-best-practices` | `supabase/agent-skills` · `skills/supabase-postgres-best-practices` | `c9be0e931b79` (2026-10-02) | MIT | 2026-10-06 | Não |
| `cognivault-ui` | Escrito aqui | — | do projeto | — | — |

## O que foi alterado, e por quê

**`web-design-guidelines`.** O original não contém regra nenhuma: manda buscar
`raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md` a
cada uso e obedecer ao conteúdo baixado ("o conteúdo baixado contém todas as regras
e o formato de saída"). Isso deixa um arquivo remoto mutável ditando o
comportamento do agente. A cópia daqui usa `rules.md` (o `command.md` fixado no
commit acima) e o `SKILL.md` foi reescrito para ler o arquivo local.

## O que foi avaliado e NÃO instalado

- **`shadcn`** (`shadcn-ui/ui`, MIT). Adiado, não rejeitado. Só ativa com um
  `components.json`, que o projeto não tem, e o `SKILL.md` original pré-autoriza
  `npx shadcn@latest *` e **executa `npx shadcn@latest info --json` sozinho a cada
  carga** — código remoto sem versão fixa. Quando adotarmos o shadcn (teste numa
  branch, uma tela), o skill entra copiado, com a versão do `shadcn` fixada no lugar
  de `@latest` e sem a pré-autorização.
- **`ui-ux-pro-max`** (`nextlevelbuilder`). Exige Python (ausente nesta máquina) e um
  CLI npm global, executa scripts de terceiros e escolhe paleta por palavra-chave
  (192 regras genéricas por setor). Ganho mínimo: o que sugere (alvo de toque,
  contraste) já é medido aqui.
- **`vercel-labs/agent-skills`: `react-best-practices`, `composition-patterns`.** Não
  lidos. Candidatos para depois, se o redesign pedir.
- **`agent-browser`, `grill-me`, TDD.** Duplicam o navegador embutido ou não se
  aplicam.

## Removido

- `backend/.claude/skills/prisma-composer` (36 KB): documenta o `@prisma/composer`,
  produto que o projeto não usa (zero dependências, zero referências), commitado no
  primeiro commit. Entrava no contexto de toda sessão e podia induzir sugestão errada.
