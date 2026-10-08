---
name: cognivault-ui
description: Regras de operação e processo para desenhar, refazer ou revisar qualquer tela do CogniVault (balcão da Vardão Máquinas). Use ANTES de frontend-design, shadcn ou qualquer mudança visual: ela diz o que é inegociável, como verificar e o que ainda está em aberto.
---

# CogniVault — interface do balcão

Estas regras **vencem** o gosto de qualquer outro skill. O `frontend-design` diz que
"as palavras do briefing sempre vencem": este arquivo é o briefing.

## Quem usa e como

Atendente de balcão, com o cliente esperando, num **PC com mouse e teclado**. **Esse é
o único alvo do design** (dono, 2026-10-06: não há tablet na loja, e celular só o
pessoal). Celular não é alvo: só não pode quebrar (sem rolagem horizontal). A
resolução do PC do balcão **ainda não foi confirmada**: projete para 1366×768 e
1920×1080. O que ele procura é a **peça**: código, descrição, preço, de onde veio a
informação. Interface que explica o sistema atrapalha.

## Inegociável (operação, não estética)

1. **Contraste medido, não olhado.** WCAG AA no DOM renderizado, compondo o alfa de
   todos os ancestrais (já erramos: 5,31:1 virou 4,51:1 com uma marca d'água por
   trás). Nunca `opacity` em cor de texto.
2. **Alvo de clique confortável (≥ 32 px) e teclado primeiro**: `Ctrl K` foca a busca,
   Enter busca, Tab percorre na ordem visual, foco sempre visível. Os 44 px de toque só
   valem se o PC do balcão tiver tela sensível ao toque (pergunta em aberto). Margem
   negativa + padding aumenta a área sem custo de layout.
3. **Código e preço são o destaque.** Código em algarismos tabulares ou monoespaçado,
   **nunca truncado**, nunca inventado. A origem (catálogo, fonte oficial, cadastro
   comercial) fica visível, porque ela sustenta a regra "nunca chutar o código".
4. **Nenhum texto que explique como o sistema funciona.** Regra do dono: *"o
   atendente quer a peça e não a explicação"*. Texto é ação (para onde olhar, o que
   digitar, qual botão). Vale também para estado de sistema ("servidor disponível").
5. **Uma ação principal por tela.** Ação destrutiva é menor e protegida.
6. **Claro e escuro funcionam** em 1366×768 e 1920×1080. Diálogo e gaveta prendem o
   foco e fecham com Esc. Em celular, só um teste de fumaça: não quebra.
7. **Custo zero.** Nenhuma dependência paga. Dependência nova só com justificativa.

**Piso proposto para o redesign, ainda NÃO ratificado pelo dono:** texto de leitura
≥ 16 px e nada abaixo de 14 px. (Os prints de 2026-10-06 mostravam 10–12 px.)

## Como verificar (o ciclo)

1. Escreva o briefing curto: tokens (cor, tipo, espaço, raio, elevação) e a regra de
   cada um. O `frontend-design` pede esse plano antes do código.
2. Mudança pequena, um PR por tela ou componente.
3. **Rode o workflow `Screens`** (`gh workflow run screens.yml`, ou abra PR que
   altere os arquivos de captura) e baixe o artefato `screens`: 8 telas × 3 larguras
   × 2 temas num ambiente descartável, sempre com o mesmo roteiro. Compare antes e
   depois. **Nunca entre no site de produção com o login real.**
4. Meça no DOM: tamanho de fonte, contraste, área de toque, estouro horizontal.
5. Rode o e2e e a revisão `web-design-guidelines`.
6. **Beleza é decisão do dono.** Apresente duas direções renderizadas; não escolha
   sozinho.

## Onde está cada coisa

- Tokens: `frontend/tailwind.config.js` (`brand`, `accent`, `gold`, `ink`) e
  `frontend/src/index.css` (`--cv-*`, classes `cv-*`). Devem andar juntos.
- Tema: `ThemeProvider`, `localStorage['vite-ui-theme']` = `light` | `dark` | `system`.
- Telas: cada uma tem endereço próprio (`/atendimento`, `/catalogos`, `/orcamentos`, `/tabela-de-precos`, `/administracao/negocio|visao-geral|usuarios|qualidade`), em `frontend/src/lib/section-routes.ts`. `/dashboard?tab=` ainda funciona e é traduzido.
- Captura: `frontend/e2e/capture-screens.mjs`, `.github/workflows/screens.yml`.

## Em aberto (decisão do dono, não minha)

- Paleta: manter azul-marinho e laranja da Vardão, ou abrir para outra?
- Tema padrão: claro (recomendado, balcão tem muita luz) ou escuro?
- Adotar shadcn/ui + Tailwind 4? Só depois de um teste numa branch, em uma tela.
  Hoje os 55 componentes são feitos à mão, sem biblioteca headless, e não achei
  tratamento de foco nos diálogos.
- Referência antiga: a paleta atual veio do CSS de `vardaomaquinas.com.br`, uma
  vitrine para consumidor. O dono considera que era outra proposta.
