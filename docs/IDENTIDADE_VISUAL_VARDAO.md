# Identidade visual Vardão Máquinas — referência para o CogniVault

Fonte: `https://vardaomaquinas.com.br` (site de loja da Vardão Máquinas), capturado
com Playwright/Chromium em 2026-09-17, em dois viewports: desktop 1440×900 e
mobile 390×844 (deviceScaleFactor 2, locale pt-BR, UA mobile real no segundo).

**Tudo aqui saiu de CSS computado** (`getComputedStyle` sobre cada elemento
visível da página, agregado por número de usos e área pintada) — não é estimativa
por cima de screenshot. O site declara as próprias variáveis de marca, e elas
batem com os valores agregados:

```
--brand        = #273a60
--brand-darker = #1f2742
--accent       = #f25420
--font-sans    = "Roboto Flex", "Roboto Flex Fallback"
```

## Paleta real

| Hex | Papel | Evidência no CSS computado |
| --- | --- | --- |
| `#273a60` | Azul-marinho da marca (`--brand`) — cabeçalhos, fundo de hero, texto de títulos | 223 usos; 2.046.069 px² de fundo; também em `stroke` de ícones |
| `#1f2742` | Azul-marinho escuro (`--brand-darker`) — hover/gradiente | declarado em `:root` |
| `#f25420` | Laranja de ação (`--accent`) — botão primário, eyebrow, ícones de destaque | 160 usos; 11 fundos; 56.633 px² |
| `#c13d0a` | Laranja escuro — **texto laranja sobre fundo claro** (contraste AA) | 127 usos, só `color`/`stroke`, nunca fundo |
| `#ffc800` | Ouro — selo "Revenda Autorizada **Ouro**" | 220 usos, 40 em `fill` de ícone |
| `#8a6a00` | Ouro escuro — texto sobre fundo claro | 4 usos, só `color` |
| `#1e1e1d` | Texto principal (não é preto puro) | `body` color; 685 usos |
| `#3d3d3c` | Texto secundário forte | 100 usos |
| `#686867` | Texto auxiliar / legenda | 156 usos |
| `#e4e4e2` | Borda neutra | fundo de divisória |
| `#f4f4f3` | Fundo neutro de seção | 4.118.658 px² |
| `#f1f4f9` | Fundo azulado de seção (par com `#f4f4f3` em gradiente) | 70.688 px² |
| `#ffffff` | Superfície de card / fundo do `body` | 12.129.169 px² |
| `#25d366` | Verde WhatsApp — exclusivo do botão de WhatsApp | 1 fundo |

Não fazem parte da marca: `#ea4335`, `#4285f4`, `#fbbc05`, `#34a853` (1 uso cada,
são o ícone do Google no bloco de avaliações) e `#000000` (só `fill` de SVG de
imagem/placeholder).

## Tipografia real

Família única: **Roboto Flex** (variável, eixo de peso 100–1000), com fallback
`Roboto, system-ui, -apple-system, "Segoe UI", Arial, sans-serif`. Não há `<link>`
de webfont — a fonte é auto-hospedada, com `Roboto Flex Fallback` para evitar
salto de layout. Mono só aparece em 2 elementos, com a pilha padrão do sistema
(`ui-monospace, SFMono-Regular, Menlo, …`).

O site usa `font-variant-numeric: tabular-nums` (`--tw-numeric-spacing`) — relevante
pro CogniVault, onde preço e código precisam alinhar em coluna.

Escala observada (tamanho/entrelinha · peso · letter-spacing):

| Papel | Valor computado |
| --- | --- |
| H1 hero | `38.4px/42.24px` · 700 · `-0.96px` |
| H2 seção | `36px/40px` · 700 · `-0.9px` |
| H2 menor | `30px/36px` · 700 · `-0.75px` |
| H3 card | `18px/28px` · 600 · `-0.45px` |
| H3 compacto | `14px/19.25px` · 600 · `-0.35px` |
| Corpo grande | `18px/29.25px` · 400 |
| Corpo | `16px/24px` · 400 |
| UI padrão | `14px/20px` · 400 / 500 / 600 / 700 |
| Legenda | `12px/16px` · 400 |
| **Eyebrow** | `12px/16px` · 700 · `1.68px` · `uppercase` |
| Selo pequeno | `9.6px/9.6px` · 600 · `1.152px` · `uppercase` |
| Badge | `11.2px/16.8px` · 600 · `0.28px` · `uppercase` |

Padrão: **títulos grandes usam letter-spacing negativo; textos pequenos em
maiúsculas usam letter-spacing bem positivo.** É a assinatura tipográfica do site.

## Forma e profundidade

- **Raios**: `9999px` (pills/badges, 24 usos), `12px` (cards, 23), `8px` (15),
  `6px` (9), `16px` (4).
- **Sombras** — muito discretas, nunca dramáticas:
  - card padrão: `0 1px 2px rgba(30,30,29,.04), 0 1px 3px rgba(30,30,29,.06)`
  - elevada: `0 12px 28px -8px rgba(39,58,96,.16), 0 4px 10px -4px rgba(30,30,29,.08)`
  - borda-anel em fundo escuro: `0 0 0 1px rgba(255,255,255,.15)`
- **Gradientes**:
  - fundo de seção: `linear-gradient(to bottom right, #f1f4f9, #f4f4f3)`
  - overlay de imagem: `linear-gradient(to top, rgba(39,58,96,.6), transparent)`
  - faixa de marca: `linear-gradient(to right, #273a60, rgba(39,58,96,.9), rgba(39,58,96,.4))`

## Padrões de composição

1. **Eyebrow + título**: texto curto em maiúsculas laranja (`#c13d0a`) com
   tracking largo, seguido de título azul-marinho pesado.
2. **Botão primário**: fundo `#f25420`, texto branco, peso 700, raio 8–12px.
3. **Botão secundário**: outline (borda `rgba(255,255,255,.4)` no escuro,
   `#e4e4e2` no claro), fundo transparente, texto no tom do contexto.
4. **Pill de contexto**: borda laranja, fundo transparente, bullet laranja +
   label maiúsculo — usado pra dizer "onde você está".
5. **Faixa de provas**: linha horizontal de 4 itens, ícone laranja + texto curto.
6. **Ação flutuante**: pill verde WhatsApp fixo no canto inferior direito.

## O que isso significa pro CogniVault

A paleta antiga do app (`#0b1d3a`, `#1d4f91`, `#123867`, dourado `#e2ae47`, fonte
Inter) **não é a da loja**. O redesign adota os tokens acima, expostos em
`frontend/src/index.css` como `--cv-*` e no `tailwind.config.js` como as escalas
`brand`, `accent`, `gold` e `ink`. Ver `CLAUDE.md`, seção "Identidade visual".

Ajuste deliberado para uso de balcão, não copiado do site de loja:
- O laranja `#f25420` é ação, **não** decoração. Em tela de balcão, onde o
  atendente busca o botão certo sob pressão, laranja espalhado destrói a
  hierarquia. Fundo e navegação ficam em azul-marinho/neutro.
- Texto laranja sobre fundo claro sempre `#c13d0a` (5,3:1 sobre branco, AA),
  nunca `#f25420` (3,5:1 — reprova AA em texto normal).
- Branco sobre `#f25420` também dá 3,5:1: só em texto grande/negrito (≥16px 700),
  que é como o site usa. Rótulo miúdo em botão laranja usa `#1e1e1d`.
- Densidade maior que a do site: o site vende, o app consulta e cota.
