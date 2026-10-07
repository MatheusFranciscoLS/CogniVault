# Plano do redesign e das melhorias (fonte única, atualizado em 2026-10-07)

Tudo que o dono pediu, em uma lista só. **Regra de trabalho:** uma parte por vez, cada uma
testada na loja simulada (`docs/loja-simulada/`) antes de subir. Definição de produto: **o site
cuida de vista explodida e orçamento; a venda acontece no sistema da loja (Clipp).**

Legenda: ✅ feito · 🔧 em andamento · ⏳ a fazer · ❓ decisão do dono

## Ordem de trabalho (decidida em 2026-10-07, a pedido do dono: "do mais necessário pro menos necessário")
1. **A inteira, do mais usado no balcão para o menos usado**: vista explodida da máquina → motores Kawasaki/Briggs → Favoritos/Histórico (cortar ou dobrar) → administração → biblioteca.
2. **B** (orçamento para o cliente). O texto do WhatsApp já está pronto e testado em `frontend/src/lib/quote-message.ts`; falta ligar na gaveta, fazer o PDF e a prévia.
3. **C** (achados da varredura).
4. **F**: auditoria "zero erros" e só então o Clipp.
Regra: não abrir frente nova antes de fechar a anterior.

## A. Visual (direção A, aprovada pelo dono)
| | Item | Onde |
|---|---|---|
| ✅ | Base: Tailwind 4, shadcn/ui, tema (`theme.css`), fonte Barlow | PR #209 |
| ✅ | Atendimento: busca, uma linha por código, copiar código em um clique | PR #209 |
| ✅ | Gaveta da peça (código, preço, vista explodida, "Leve junto") | PR #209 |
| ✅ | Gaveta de orçamento | PR #209 |
| ✅ | Lista de Orçamentos | PR #209 |
| ✅ | Catálogos | PR #209 |
| ✅ | Login | PR #209 |
| ✅ | Painel lateral da máquina / vista explodida oficial: Sheet, uma linha por peça, código copiável, sem especificações/acessórios/"onde usa"; variantes em menu | PR #209 |
| ⏳ | Painéis de motor Kawasaki e Briggs | |
| ⏳ | Administração: Negócio, Usuários, Qualidade, Visão geral, Auditoria | ver D |
| ⏳ | Gerenciar biblioteca (`CatalogsPanel`, 1.365 linhas) | admin |

## B. Orçamento para o cliente (pedido: "melhorar o local de orçamento, WhatsApp e PDF")
| | Item |
|---|---|
| 🔧 | Ver o que o cliente recebe hoje (texto do WhatsApp e PDF) e refazer — texto do WhatsApp escrito e testado (`quote-message.ts`, 16 testes), ainda NÃO ligado à gaveta |
| ⏳ | Texto do WhatsApp: cliente, máquina, itens, total, condição, validade, sem poluição |
| ⏳ | PDF: cabeçalho da loja (Vardão, selo ouro), tabela legível, total, validade, rodapé com contato |
| ⏳ | Prévia do que será enviado antes de enviar |
| ⏳ | Validade do orçamento ("válido até") e observação livre |
| ⏳ | Enviar ao número do cliente quando há telefone (já existe) e arquivar sempre |

## C. Achados da varredura de uso real (loja simulada)
| | Achado | Ação |
|---|---|---|
| ✅ | Busca com acento devolvia zero ("vela de ignição") | PR #210, no ar |
| ✅ | Linhas repetidas do mesmo código | PR #209 |
| ⏳ | A ordem dos grupos é CSS (`order`): teclado e leitor de tela seguem outra ordem | reordenar no JSX |
| ⏳ | O botão fica "Buscando…" até a fase "por significado" acabar, com o resultado já na tela | liberar na 1ª fase |
| ⏳ | "fio de nylon" e "bomba primer" não acham nada: ver se existe na lista e por que não casa | investigar |
| ⏳ | Pergunta de óleo ("óleo 2 tempos") devolve filtro de óleo; óleo é item avulso | oferecer os botões de óleo na busca |
| ℹ️ | Os 4–6 s da busca técnica na simulação são a fase "por significado" esperando o Gemini com chave falsa: artefato, não defeito | — |

## D. Decisões do dono (❓) — em `analise-critica.md`
1. ❓ Assistente de IA em gaveta (`ChatPanel`): recomendo tirar.
2. ❓ Tela Histórico: recomendo dobrar na busca e apagar a tela.
3. ❓ Painéis de administração: manter Negócio, Usuários, Qualidade; juntar Visão geral + Auditoria; tirar Feedback.
4. ❓ Sino de notificações só para administrador.
5. ❓ Favoritos: a tela e o botão ainda existem no código (só saíram da Atendimento e do Catálogo).

## E. Ideias para o dia a dia (a avaliar, dentro de "vista explodida + orçamento")
- Orçamento: atalho "Repetir último orçamento deste cliente"; texto padrão de condições da loja.
- Busca: últimas buscas ao focar o campo (substitui o Histórico).
- Vista explodida: abrir na página certa a partir da linha da peça (hoje só na gaveta).
- Peça sem preço: caminho único para consultar no Portal Parceiro e preencher o preço no orçamento.
- Prateleira e estoque assim que o Clipp entrar (aparecem só se existirem).

## H. Tabela de preços da Husqvarna como aba separada (ideia do dono, 2026-10-07)
Pedido: colocar a lista de preços inteira no site, em **uma aba totalmente separada** do atendimento e do orçamento (nome provisório: "Tabela de preço" ou "Máquinas em vigência"), para saber quais máquinas estão em vigência na Husqvarna, quais podem ser vendidas e o que vem junto.
| | Item |
|---|---|
| ⏳ | Verificar o que a lista de preços realmente contém (máquinas? só peças?) antes de desenhar a tela |
| ⏳ | "O que vem junto" / "não acompanha": já existe na API do Portal (`equipment.included/notIncluded`); foi tirado do painel da máquina e volta aqui |
| ⏳ | Aba própria, só consulta: filtro por categoria/modelo, em vigência x descontinuada, preço de venda (consumidor ÷ 0,92), sem custo |
| ❓ | Quem vê: balcão e admin, ou só admin? (tabela com todos os preços é mais sensível que um item no orçamento) |
Dados ficam no banco, nunca no repositório (repo público). Entra depois de A, B e C, antes da auditoria "zero erros" (para a auditoria já cobrir a aba nova).

## F. Depois do visual (ordem combinada com o dono)
1. ⏳ **Auditoria "zero erros"**: varredura completa de lógica, programação e código.
2. ⏳ **Clipp**: pedir a exportação de produtos pela tela do Clipp (Referência, preço, descrição complementar, última compra, estoque); importador testado em banco descartável; aprovação; só então gravar.
3. ⏳ Mesclar o PR #209 quando o dono aprovar o visual (hoje é rascunho).

## G. Pendências pequenas
- `verify:production-origin` quebra no Windows (caminho `C:\C:\`): só roda no Linux do CI.
- `C:\DadosLoja`: apagar `relatorio-precos.csv` agora; guardar `antes-de-gravar-2026-10-07.csv` por ~2 semanas (é o "desfazer" dos 80 preços).
- Revisar o `CLAUDE.md` (1.200+ linhas): mover diários de investigação para `docs/`.
