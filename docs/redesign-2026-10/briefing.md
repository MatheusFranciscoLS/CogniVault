# Redesign do CogniVault — briefing de tokens (2026-10-07)

**Assunto:** balcão de peças de uma revenda **ouro Husqvarna** (Vardão Máquinas).
**Quem usa:** atendente, com o cliente esperando, num PC com mouse e teclado (monitor de
até 24", resolução não confirmada: projetar para 1366×768 e 1920×1080). Sem toque.
**Trabalho da tela:** do que o cliente descreve (código, nome, modelo) até a peça certa,
com preço e prateleira, e dali ao orçamento. Em poucos segundos.
**Direção escolhida pelo dono:** A (lista densa), "muito profissional e moderno, sem
poluição nem informação irrelevante", sem seguir o CSS do site da loja.

## Ponto de vista

A referência é o **balcão de peças**, não o site de e-commerce: etiqueta de prateleira,
código em destaque, preço alinhado, linhas régua. A única coisa memorável é o **código
da peça**, composto como etiqueta (condensado, seminegrito, algarismos tabulares). O
resto é quieto e disciplinado.

## Tokens

**Cor** (a marca já é o azul `#273A60` do arquivo oficial de preços da Husqvarna)
| Nome | Escuro | Claro | Papel |
|---|---|---|---|
| fundo | `#0E1424` | `#EEF0F4` | página (claro é frio, não creme) |
| superfície | `#151D33` | `#FFFFFF` | tabela, painéis |
| elevada | `#1C2745` | `#F6F7FA` | cabeçalho de tabela, linha selecionada |
| linha | `#2B3858` | `#D9DDE6` | réguas e bordas |
| texto / texto 2 / texto 3 | `#EEF1F7` / `#B4BDD2` / `#8E99B4` | `#1B2234` / `#454D62` / `#5F667A` | |
| marca | `#273A60` | `#273A60` | barra superior |
| ação | `#C13D0A` (hover `#9A3109`) | idem | **só** botão principal e foco |
| ouro | `#FFC800` | `#8A6A00` | **só** o selo "Revenda ouro Husqvarna" |
| ok / aviso / erro | `#5FD6A4` `#FFD45C` `#FF8F8F` | `#0A6B4A` `#7A5800` `#A52626` | estado de estoque e preço |

Laranja é ação, nunca decoração. Texto sobre `#C13D0A` é branco (5,3:1). O mesmo vale
nos dois temas: claro e escuro têm o mesmo peso, o app lembra a escolha de cada pessoa.

**Tipografia** (fontes embutidas no app, sem CDN: o balcão precisa funcionar offline)
- **Barlow** — texto e interface. Herança de sinalização industrial, boa em corpo
  pequeno, algarismos tabulares.
- **Barlow Semi Condensed** — código e preço (a "etiqueta"). 600, tabular.
- Escala: corpo 16, apoio 14 (mínimo absoluto), título de painel 20, código 22–24,
  preço 24–28. Sentença normal em rótulo, **sem** maiúscula espaçada.

**Forma:** raio 8 para controle, 12 para painel. Tabela com réguas, não cartões
iguais. Sombra só em camada flutuante (gaveta, menu).

**Movimento:** nada que dispare sozinho. Resposta ao clique (confirmação de adicionar,
abrir a ficha) em ≤ 150 ms; carregamento é linha cinza no lugar da peça.

## Princípios
1. A peça buscada vem primeiro; máquina e documentos são atalhos pequenos e ordenados.
2. Uma linha mostra: **código, nome, prateleira, preço, botão**. O resto abre na ficha.
3. Uma só aparência para "adicionar ao orçamento". Orçamento sempre à vista, à direita.
4. Nenhum texto que explique o sistema. Texto é ação.
5. Teclado ajuda, nunca é exigido: setas percorrem, Enter adiciona. Foco sempre visível.
6. Estado vazio e carregamento são úteis, não decorativos.

## Revisão contra o genérico
Plano conferido contra os tiques comuns: sem fundo creme com serifa, sem preto com verde
ácido, sem manchete de jornal, sem pilha de cartões iguais com a mesma sombra, sem rótulo
em caixa alta espaçada, sem ponto médio juntando metadados. A cor do dark navy + laranja
de ação lembra um padrão comum, mas é a **marca da Husqvarna e da loja**, fixada pelo
dono; a escolha ficou na tipografia de etiqueta e na tabela em régua.
