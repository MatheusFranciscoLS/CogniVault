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

## Regra de teste (dono, 2026-10-07)
Toda tela aberta é testada em TODO o conteúdo dela, controle por controle, e não só no que aparece no topo. Roteiros em `docs/loja-simulada/` (`maquina-completo.mjs`, `motores.mjs`, ...); uma tela só fecha com o roteiro 100% e as capturas olhadas até o fim.

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
| ✅ | Painéis de motor Kawasaki e Briggs (linha de peça compartilhada `PartLine`) | PR #209 |
| ⏳ | Administração: Negócio, Usuários, Qualidade, Visão geral, Auditoria | ver D |
| ⏳ | Gerenciar biblioteca (`CatalogsPanel`, 1.365 linhas) | admin |

## B. Orçamento para o cliente (pedido: "melhorar o local de orçamento, WhatsApp e PDF")
| | Item |
|---|---|
| 🔧 | Ver o que o cliente recebe hoje (texto do WhatsApp e PDF) e refazer — texto do WhatsApp escrito e testado (`quote-message.ts`, 16 testes), ainda NÃO ligado à gaveta |
| ✅ | Texto do WhatsApp, PDF, prévia e validade com data: feitos (ver "Gaveta do orçamento" em I) |
| ⏳ | Observação livre no orçamento (precisa de campo novo no servidor) |
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

## I. Melhorias achadas ao percorrer cada tela (fonte: roteiros de `docs/loja-simulada/`)
Regra: cada tela percorrida entra aqui com o que foi corrigido na hora (✅) e o que fica como ideia (💡) ou decisão (❓).

### Atendimento
| | Achado |
|---|---|
| ✅ | "Buscando…" ficava até 4,5 s depois de a lista já estar na tela: agora libera quando há peças (e a busca nova cancela a anterior, para não misturar resultados) |
| ✅ | "+ 7" solto ao lado dos documentos virou "Mais 7"; "+19 aplicações" saiu da linha (é o "onde usa"); "Ref. HUSQVARNA" (a marca) saiu |
| ✅ | `Button` agora é `type="button"` por padrão: dentro de formulário, "+ Orçamento" podia refazer a busca |
| 💡 | **Copiar todos os códigos do orçamento de uma vez** (um por linha, com quantidade) para colar no Clipp: a venda é lá, então é o caminho de saída natural do orçamento |
| 💡 | Teclado primeiro: ↑/↓ percorrem as linhas e Enter copia o código (hoje só Ctrl K e Enter na busca) |
| 💡 | Últimas buscas ao focar o campo (some a tela Histórico) |
| 💡 | Linhas se reordenam quando a fase "por significado" acrescenta peças: marcar o que chegou depois, ou só anexar no fim do grupo |
| 💡 | Abrir uma máquina grava a máquina no atendimento sem avisar: mostrar que foi gravada |
| 💡 | Pergunta de óleo devolve 20+ linhas de filtro/vela: oferecer os botões de óleo no topo |
| ❓ | Contexto (cliente/máquina) sobrevive ao recarregar: manter? hoje fica até "Encerrar atendimento" |
| 💡 | A máquina aparece duas vezes: na barra de contexto e como chip "recente" logo abaixo da busca |
| 💡 | **9 diálogos nativos do navegador (`window.confirm`)**: Encerrar atendimento, Esvaziar orçamento, Retomar e Excluir orçamento (balcão) e mais 5 na administração/biblioteca. Trocar por um diálogo do próprio site, com o texto do que será perdido e botão claro |

### Gaveta da peça
| | Achado |
|---|---|
| ✅ | O Esc que fecha o menu ⋯ fechava a gaveta inteira (tratador global duplicado): corrigido |
| ✅ | **"Registrar conferência"** refeito com o diálogo do shadcn (foco preso, `role="dialog"`, Esc fecha só ele) e sem o texto que explicava o sistema; 9 verificações novas no roteiro da gaveta |
| 💡 | "Leve junto": companheiro sem nome mostra o código duas vezes ("595353 / 595353") |
| 💡 | Falha ao abrir o PDF mostra um aviso no canto, bom; poderia oferecer "tentar de novo" |

### Gaveta do orçamento (26 verificações)
| | Achado |
|---|---|
| ✅ | O "−" na quantidade 1 apagava o item em silêncio (sem confirmar, sem desfazer): agora fica desabilitado, com a dica "use o ×" |
| ✅ | **Texto do WhatsApp refeito** (`lib/quote-message.ts`): sem "Assistência Técnica" (a loja é revenda ouro), sem posição/seção/PNC internos, valores com separador de milhar, **data de validade** em vez de "7 dias úteis", pagamento só quando combinado |
| ✅ | O cliente via **R$ 435,92** e o orçamento arquivado guardava **R$ 435,91** (arredondamento diferente do servidor): alinhado, travado em teste |
| ✅ | Serviço avulso ("Mão de obra") contava como segunda máquina e o texto repetia "Máquina:" em toda peça |
| ✅ | **PDF refeito** (`lib/quote-pdf.ts`, 8 testes): cabeçalho da loja, tabela com código em Courier, total em destaque, "Válido até", rodapé com "Página n de N"; **prévia** da mensagem do WhatsApp com "Copiar mensagem" |
| ✅ | O total na gaveta estava um centavo diferente do que o cliente recebia (R$ 435,92 x 435,91): agora os três (gaveta, texto, PDF) usam a mesma conta |
| 💡 | Texto livre para observação ("peça sob encomenda, prazo 5 dias") no WhatsApp e no PDF |
| 💡 | Telefone digitado sem máscara ("19987654321"): formatar enquanto digita |

### Orçamentos (arquivo) (24 verificações)
| | Achado |
|---|---|
| ✅ | **"Buscar" travava a tela em "Carregando orçamentos…" para sempre** quando o filtro não mudava (por exemplo, depois de preencher as datas): sempre recarrega agora |
| 💡 | Datas filtram a cada campo preenchido e o botão Buscar fica redundante: escolher um dos dois |
| 💡 | Retomar abre a gaveta por cima da lista (bom) mas substitui a cesta atual com um `confirm` nativo |

### Catálogos (21 verificações)
| | Achado |
|---|---|
| ✅ | Lista, busca, categoria, "Ver peças", "Abrir vista explodida", busca do cabeçalho: tudo percorrido, sem defeito |
| 💡 | **"Gerenciar biblioteca"** (admin) segue no estilo antigo e cheio de texto que explica o sistema ("Modelo e PNC são dados diferentes…"): refazer mantendo só importar PDF e a lista por seção |

### Login (21 verificações, escuro e claro)
| | Achado |
|---|---|
| ✅ | Quem já estava logado e abria `/login` via o formulário de novo: agora vai direto ao painel |
| 💡 | Depois de "Sair", o rascunho do orçamento daquele e-mail continua no navegador (separado por e-mail, então outro atendente não vê); em PC compartilhado, limpar ao sair? |

### Telas ainda no estilo antigo (percorridas: abrem e funcionam, 17 verificações)
Todas com texto de 9 a 12 px e frases que explicam o sistema; nenhuma tem erro nem rolagem horizontal.
| Tela | Controles | O que vi |
|---|---|---|
| Favoritos | 2 | vazia ("Nenhum favorito encontrado"); o botão de favoritar já saiu da gaveta de busca. **Recomendo apagar a tela.** |
| Histórico | 50 | 20 consultas; **consultas "Analise a peça …" são o texto automático do "Perguntar à IA", não o que o atendente digitou** (poluição do histórico). Recomendo dobrar na busca (últimas buscas) e apagar a tela |
| Negócio | 9 | números e gráfico bons; cartões na paleta antiga |
| Visão geral | 6 | números técnicos (catálogos, peças indexadas): juntar com Auditoria |
| Usuários | 8 | ✅ **refeita** (`admin/UsersPanel.tsx`, `admin/AdminPage.tsx`): lista limpa, ações em menu ⋯, confirmação antes de mudar perfil ou bloquear, redefinição de senha em diálogo; 24 verificações. Saiu a coluna "Feedback" |
| Feedback | 5 | 0 avaliações registradas: recomendo tirar (dono já viu que é pouco uso) |
| Qualidade | 6 | 2.659 caracteres de texto; manter, refazer |
| Auditoria | 1 | 100 eventos, só leitura; juntar com Visão geral |

### Desempenho do servidor (achado pelo roteiro do Atendimento)
| | Achado |
|---|---|
| ✅ | **Uma busca descritiva congelava o servidor inteiro por 5 a 10 s** (até o `/health/live` ficava sem resposta). Perfil de CPU: 12 de 15 s estavam em `part-vocabulary.ts` e `normalizeText`, que renormalizavam o vocabulário todo a cada peça candidata. Corrigido guardando o que não muda; **8.325 ms → 459 ms** ("junta do carburador"), 4.056 textos e 3.000 peças comparados com a versão antiga: **0 diferenças**. Vai em PR separado (é backend, afeta a produção) |
| 💡 | O Render free tem CPU bem menor que esta máquina: antes da correção o mesmo congelamento seria muito pior lá, e o health check podia dar timeout |

### Diálogos de confirmação
| | Achado |
|---|---|
| ✅ | Os 9 `window.confirm` do navegador viraram um diálogo do site (`useConfirm`, AlertDialog do shadcn): texto do que será perdido, botão com o nome da ação ("Esvaziar", "Excluir"), vermelho quando apaga; os roteiros agora falham se um diálogo nativo aparecer |

### Painel da máquina / vista explodida
| | Achado |
|---|---|
| ✅ | Tela inteira refeita e testada controle a controle (34 verificações) |
| 💡 | Posições sobrepostas no desenho da Husqvarna (ex.: a 1 fica embaixo da 4, duas peças na posição 7): destacar a linha ao passar o mouse na lista e vice-versa |
| 💡 | "Selecionar todas desta vista" + copiar só os códigos selecionados |
| 💡 | Lembrar a última vista aberta por máquina |

### Motores Briggs e Kawasaki
| | Achado |
|---|---|
| ✅ | Refeitos com a mesma linha de peça das outras marcas; 16 verificações |
| 💡 | Kawasaki: nome da peça às vezes traz aviso de série no texto ("FOR FX921V SERIAL NUMBERS THROUGH…"): separar o aviso do nome |
| 💡 | Briggs/Kawasaki: filtro por nome também nos conjuntos da Kawasaki |

## F. Depois do visual (ordem combinada com o dono)
1. ⏳ **Auditoria "zero erros"**: varredura completa de lógica, programação e código.
2. ⏳ **Clipp**: pedir a exportação de produtos pela tela do Clipp (Referência, preço, descrição complementar, última compra, estoque); importador testado em banco descartável; aprovação; só então gravar.
3. ⏳ Mesclar o PR #209 quando o dono aprovar o visual (hoje é rascunho).

## G. Pendências pequenas
- `verify:production-origin` quebra no Windows (caminho `C:\C:\`): só roda no Linux do CI.
- `C:\DadosLoja`: apagar `relatorio-precos.csv` agora; guardar `antes-de-gravar-2026-10-07.csv` por ~2 semanas (é o "desfazer" dos 80 preços).
- Revisar o `CLAUDE.md` (1.200+ linhas): mover diários de investigação para `docs/`.
