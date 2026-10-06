---
name: web-design-guidelines
description: Revisa código de interface contra as Web Interface Guidelines da Vercel (acessibilidade, foco, formulários, toque, tema escuro, copy). Use quando pedirem "revisar a UI", "checar acessibilidade", "auditar o design" ou "revisar UX" de arquivos específicos.
---

# Web Interface Guidelines (cópia fixada)

Revise os arquivos indicados contra as regras de `rules.md`, que fica nesta mesma pasta.

**Esta versão NÃO baixa nada da internet.** O skill original da Vercel manda buscar
as regras numa URL a cada uso e obedecer ao conteúdo baixado — um arquivo remoto
mutável ditando o comportamento do agente sem revisão. Aqui as regras são uma
cópia fixada em um commit conhecido (ver `.claude/skills/PROVENANCE.md`) e só
mudam por PR.

## Como usar

1. Leia `rules.md` (regras e formato de saída).
2. Leia os arquivos pedidos. Sem arquivo indicado, pergunte qual.
3. Aplique todas as regras e responda no formato `arquivo:linha - problema`.

## Onde esta cópia perde para o CogniVault

Se uma regra daqui conflitar com `cognivault-ui`, **vale o `cognivault-ui`**. Um
exemplo: as guidelines aceitam um alvo de toque menor que o nosso piso de 44 px.
