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

## Fila de trabalho (do MAIOR problema para o menor; atualizar a cada pedido do dono)
Regra do dono (2026-10-07): **tudo que ele passar entra aqui na hora**, porque há muitas frentes abertas; e a ordem é sempre do maior problema para o menor. "Maior" = o que faz o balcão pedir/vender errado ou ficar sem resposta.
| # | Frente | Situação |
|---|---|---|
| 1 | 🔴 **Troca de código (Portal) mostra o PRÓXIMO passo, não o ÚLTIMO.** Achado ao testar: para 506027201 o Portal diz que o mais recente é 587329503 (cinco trocas depois), mas a gaveta mostra 506027207, que também já foi trocado. Na hora de PEDIR, a Husqvarna só aceita o código novo (dono). Corrigir para mostrar o último da cadeia (com o caminho), e **fazer a checagem automática** ao buscar um código (hoje só roda ao abrir a gaveta ou quando nada é achado). Nada manual (dono). Regra: o Portal é a fonte; o que foi pedido continua visível ao lado do código novo, para o atendente ver que o código digitado foi reconhecido | ✅ feito (PR desta rodada): `replacedBy` agora é o último da cadeia, faixa automática na busca por código e na gaveta, roteiro `troca-codigo-completo` 19/19 nos dois temas |
| 2 | **Cadeia de "similaridade" da lista de preços** (6.118 ligações; 4.224 peças): medida contra o Portal em 40 códigos antigos, **26 concordam e 9 divergem** (o Portal diz que o código antigo já é o mais recente, ou termina em outro). É o "similar que nem sempre dá certo" do dono. Decisão: NÃO vira redirecionamento automático. Parser, importador e tabela estão prontos e guardados no stash `similaridade-da-lista` (não enviados); só valem como **dica secundária** ("similar na lista, confirme") quando o Portal não responde | ⏸ parado de propósito |
| 3 | **Orçamento do cliente: SEM códigos das peças** e **no modelo do timbrado da loja**. Feito: WhatsApp, PDF e folha impressa sem código; **PDF igual ao modelo em Word** (logo, dados da loja no alto e no rodapé, "Limeira, data", A/C, Ref., tabela com prazo, condições, validade de 20 dias, transportadora, observações e "ATT. atendente"); a ficha da máquina usa o mesmo timbre. Falta: confirmar os padrões com o dono (lista de perguntas) e campos editáveis na gaveta (A/C, Ref., observações) | ✅ PDF de peças · ⏳ campos editáveis |
| 4 | **Importar as máquinas (e depois o que mais vier da lista) em produção**: depende da aprovação do dono (relatório só lê; `--apply --expect-count=151`) | ❓ dono |
| 5 | **Auditoria da API do Portal** (pedido do dono): feita em 2026-10-07 por introspecção ao vivo. Resultado: a integração já usa quase tudo que serve ao balcão (inclusive as especificações dimensionais, que uma nota antiga dizia faltar). O que sobrou: `necessaryProducts`/`recommendedProducts` (vêm quase vazios e, quando vêm, são itens de marketing com SKU próprio: luva, bolsa), `relatedTools`/`standardEquipment` (exigem argumento de paginação), vídeos e `repairabilityIndex`. **O dono NÃO quer dados de estoque recomendado (`stockRecommendations`) nem de peso**: fora de qualquer tela | ✅ feita; só o item 1 sai dela |
| 6 | Dono: "usar sempre a lista de preços em HTML para achar funcionalidades e melhorias": análise na seção J (ordem Husqvarna, selo "Em linha", ficha ao cliente, "Leve junto" já entregues no #214) | ✅ rodada 1 |
| 7 | "Peças de manutenção preventiva por PNC" (campo `reparo` da lista: 191 máquinas, mediana de 8 peças preventivas, 101 das 151 máquinas da tabela); lista de compras/CSV do Portal Parceiro (só se o dono pedir). Já feitos nesta rodada: atalho `/`, teclado na lista, copiar códigos | 💡 |
| 8 | Refazer por dentro Negócio, Qualidade, Visão geral e a Biblioteca; decidir ChatPanel; auditoria "zero erros"; Clipp (pedir a exportação de produtos) | ⏳ depois |

### Pedidos novos do dono (2026-10-07, pelo celular) — entram na fila acima, em ordem de importância
| # | Pedido | Situação |
|---|---|---|
| 3a | **PDF do orçamento IGUAL ao modelo em Word, com a logo** (pedido do dono). **Entregue** com os padrões do próprio modelo (validade 20 dias, transportadora Retira, prazo IMEDIATO, 3 observações, A/C = nome do cliente, ATT. = nome tirado do e-mail do atendente). Os dados da loja ficam em `lib/store-profile.ts` (dados públicos de pessoa jurídica). O dono achou melhor deixar para depois; mantido porque já estava pronto e testado, e cada padrão troca em um lugar só | ✅ entregue; padrões a confirmar |
| 3b | **Orçamento de MÁQUINAS automatizado.** O dono faz "tudo manual" e disse que é "bem bacana"; quer que o site gere. Os orçamentos reais estão em **Word, em pastas por grupo, no PC da loja** (o `.rar` que ele mandou continha só um atalho). **Ele coloca a pasta no computador ao chegar em casa**; até lá, nada a fazer. Depois: ler 2 ou 3 de cada grupo, mapear campos e blocos e gerar do mesmo jeito (a Tabela de preços já tem preço, ficha, "acompanha" e "leve junto"). Dados de cliente dos exemplos NUNCA vão para o repositório | ⏳ aguarda a pasta |
| 3c | **Lista curta do que o dono precisa responder** (ele está no celular e as mensagens são muitas): mandar sempre em poucas linhas, numeradas, com a resposta mais provável já sugerida. Mantida na seção "Perguntas pendentes ao dono" abaixo | ✅ feita nesta rodada |

### Pedido do dono (2026-10-07, depois das respostas): auditoria geral e melhorias da administração e da IA
> "Tem melhorias para ser feito nessa aba de administração? E até mesmo melhorias da IA, essa cobertura técnica e tudo mais? Melhoria para o meu site em geral, **fazer toda a parte do backend ficar sem erros e da melhor forma possível**."

| # | Frente | Situação |
|---|---|---|
| A1 | **Auditoria "zero erros" do backend** (a do item 8 da fila, agora pedida de forma explícita): varredura de lógica, rotas sem tratamento de erro, validação de entrada, consultas pesadas, transações, código morto, segurança básica (CodeQL, `npm audit`, RLS), cobertura de teste. Cada achado é medido antes de mexer | 🔧 1ª leva feita (PR `feat/auditoria-backend`): todo `findMany` sem `take` é limitado por `where`; todo fetch externo tem timeout; sem módulo morto fora do chat; única falha latente achada estava no chat-intent (podado). 2ª leva (2026-10-07): `npm audit --omit=dev` = 0 vulnerabilidades; validação de corpo conferida rota a rota (cadastro de usuário, login, preços, orçamento têm limite e tipo); achado real: POST sem corpo respondia 500 em vez de 400 (Express 5 deixa `req.body` indefinido), corrigido em `app.ts` com teste; todo `void promessa()` confere que a função nunca rejeita. Falta: exports sem uso |
| A2 | **Poda do chat que sobrou no servidor** (`/api/chat`, `react-agent`): sem tela desde que o assistente em gaveta saiu, mas as rotas seguem expostas a quem está logado e podem gastar IA | ✅ podado: `/api/chat`, chat/react-agent/confidence-gate e afins, mais as rotas de escrita sem tela (favoritos, feedback POST/PATCH, uso de busca). 745 testes (eram 786), só os 3 do RabbitMQ falham sem broker. Rotas sem tela que ficaram: `GET /home`, `commercial-imports`, `search-intelligence`, `index-semantics` e leitura de feedback do admin |
| A3 | **Administração, melhorias**: Visão geral com larguras desencontradas (a faixa de cima é estreita e as de baixo, largas), texto "Operação do assistente" que ficou sem sentido sem o assistente; Qualidade: a "cobertura técnica" (17%, 60 de 362 modelos) é útil mas o painel é só leitura: oferecer o próximo passo | 🔧 Visão geral feita: larguras iguais, título "Uso de IA e cobertura técnica", sem os números de feedback (não há mais voto novo). Falta o próximo passo da cobertura técnica (A4) |
| A4 | **IA e cobertura técnica**: o que mede e o que poderia agir (ver A3); regra de custo zero continua | ✅ Dono: "parece crítico, como comprovar?". Era só conferência que ninguém rodava: agora a Qualidade confere o Portal sozinha ao abrir (8 por vez, guardado 7 dias) e reconhece IPL em PDF do Portal. **17% → 80%** (289 de 362). Os 73 que sobram são Automower, bateria e marcas do grupo |
| A5 | **Kohler automático** (ideia do dono, 2026-10-07): o balcão já tem Husqvarna (Portal), Briggs (API de manuais + IPL lido do PDF) e Kawasaki (ARI); falta Kohler pelo mesmo caminho, sem subir PDF à mão. O dono vai achar o link da Kohler e mandar para eu medir (ARI, API própria ou só PDF). A Kawasaki já é integrada pelo ARI PartStream, com vista explodida igual à da Husqvarna | 💡 ideia, espera o link do dono |
| A6 | **"Cobertura IPL local" não mede o que o dono quer**: conta só modelos com PDF subido (`LOCAL_IPL`), e o dono NÃO quer subir PDF à mão. Dono: "faça o que achar melhor". Feito: o cartão virou "Modelos com fonte técnica" (Portal + biblioteca) e o bloco lista Portal, biblioteca e "ainda sem conferência" | ✅ |

### Respostas do dono (2026-10-07, à noite) e o que cada uma virou
| # | Pergunta | Resposta | O que fazer / situação |
|---|---|---|---|
| 1 | Importar as 151 máquinas em produção | **Sim** | Relatório só de leitura, depois gravar com `--apply --expect-count`; conferir depois. ✅ **feito em 2026-10-07**: relatório (151 lidas, 0 recusadas) e gravação com `--apply --expect-count=151`, releitura sem diferença |
| 2 | Validade de 20 dias | **Sim.** A validade de 20 dias é do ORÇAMENTO. Os "7 dias úteis" são o PRAZO PARA AS PEÇAS CHEGAREM e dependem do estoque: **o prazo é digitado à mão em cada orçamento** | Campo "Prazo" editável no orçamento (padrão IMEDIATO), saindo no PDF e no WhatsApp. ✅ feito: campo "Prazo das peças" na gaveta (vazio = IMEDIATO), coluna `Quote.leadTime` (migração `20261007200000_quote_lead_time`), PDF e WhatsApp |
| 3 | Razão social do cabeçalho | **A certa é "VARDÃO MÁQUINAS E EQUIPAMENTOS DE JARDINAGEM LTDA"** (consultar o CNPJ se precisar) | Usar essa em cabeçalho e rodapé; conferir no cadastro do CNPJ. ✅ feito (cadastro do CNPJ conferido na BrasilAPI: VARDAO MAQUINAS E EQUIPAMENTOS DE JARDINAGEM LTDA, mesmo endereço) |
| 4 | Observações fixas (imposto etc.) em todo orçamento? | "O que você acha melhor?" Ele colocou por causa de imposto | **Recomendação adotada:** as 3 observações entram em TODO orçamento por padrão e podem ser editadas por orçamento (campo recolhido na gaveta). ✅ feito: 3 observações por padrão, editáveis por orçamento (`Quote.notes`), "Voltar ao texto padrão" |
| 5 | Formato do "Copiar códigos" para o Clipp | **Não faz sentido: o Clipp recebe 1 código por vez**; só precisa colocar o código e copiar | **Tirar o botão "Copiar códigos"** (foi excesso meu) e a função; fica o copiar um código, que já existe. ✅ botão, função e testes removidos |
| 6 | Pasta dos orçamentos de máquinas | Manda quando chegar em casa | Aguardar (3b) |
| 7 | Sino só para admin; assistente de IA em gaveta | "Faça o que achar melhor e recomendado" | **Recomendação adotada:** sino só para o administrador; tirar o assistente de IA em gaveta (`ChatPanel`) do balcão. ✅ feito: sino só para o administrador (o balcão nem consulta as notificações); assistente de IA em gaveta (`ChatPanel` e `chat/*`) removido, junto com "Perguntar à IA", "Pedir orientação" e o exemplo de pergunta. **O backend do chat (`/api/chat`, `react-agent`) continua no servidor, sem uso na tela: podar depois, com cuidado** |
Depois disso: "continue com os planos e melhorias que faltam" (Biblioteca, Negócio, Qualidade, Visão geral; peças de manutenção preventiva por PNC).

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
| 🔧 | Administração: Usuários ✅ e telas restiladas ✅; Favoritos, Histórico e Feedback removidos e Auditoria virou "Registro de ações" dentro da Visão geral ✅ (dono autorizou em 2026-10-07). Falta refazer por dentro Negócio, Qualidade e Visão geral | ver D |
| ⏳ | Gerenciar biblioteca (`CatalogsPanel`, 1.365 linhas) | admin |

## B. Orçamento para o cliente (pedido: "melhorar o local de orçamento, WhatsApp e PDF")
| | Item |
|---|---|
| 🔧 | Ver o que o cliente recebe hoje (texto do WhatsApp e PDF) e refazer — texto do WhatsApp escrito e testado (`quote-message.ts`, 16 testes), ainda NÃO ligado à gaveta |
| ✅ | Texto do WhatsApp, PDF, prévia e validade com data: feitos (ver "Gaveta do orçamento" em I) |
| ⏳ | **PDF do cliente no modelo do timbrado da loja (pedido do dono, 2026-10-07; anotado, não feito):** o dono mandou o modelo `ORÇAMENTO TIMBRE PEÇAS.doc` ("quero algo assim ou melhor"). **Regra nova: SEM os códigos das peças no que o cliente recebe**, porque ele poderia cotar o mesmo código em outra revenda. Vale para o PDF e, por coerência, para o texto do WhatsApp (hoje os dois mostram o código). Estrutura do modelo: cabeçalho com os dados da loja (razão social, CNPJ, inscrição, endereço, telefones, e-mail); "Cidade, data"; "A/C: cliente"; "Ref.: Estimativa de Preço Peças de Reposição"; tabela DESCRIÇÃO · prazo (IMEDIATO) · VALOR UNIT · VALOR TOTAL; total; condição de pagamento (a combinar), **validade 20 dias** (hoje usamos 7 dias úteis), transportadora (Retira), observações ("preços para faturamento no estado de SP", "impostos inclusos", "estoque rotativo sujeito a venda diária") e assinatura "ATT. nome do atendente"; rodapé com os dados da loja. Perguntas ao dono: onde guardar os dados da loja (configuração, não no git); a validade passa a 20 dias?; "A/C" e "Ref." viram campos do orçamento?; as observações fixas valem para todo orçamento? |
| ⏳ | Observação livre no orçamento (precisa de campo novo no servidor) |
| ⏳ | Enviar ao número do cliente quando há telefone (já existe) e arquivar sempre |

## C. Achados da varredura de uso real (loja simulada)
| | Achado | Ação |
|---|---|---|
| ✅ | Busca com acento devolvia zero ("vela de ignição") | PR #210, no ar |
| ✅ | Linhas repetidas do mesmo código | PR #209 |
| ✅ | Ordem dos grupos: não há mais CSS `order`; o roteiro confere que a ordem visual é a do DOM | — |
| ✅ | O botão ficava "Buscando…" até 6 s com o resultado já na tela | liberado quando há peças; busca nova cancela a anterior |
| ✅ | "fio de nylon" (a lista escreve NAILON) e "bomba primer" (a lista diz BOMBA MANUAL) achavam zero: 0→49 e 0→3 | PR #212 (dono confirmou: "primer" = bomba manual do carburador); no ar |
| ✅ | Pergunta de óleo: os 4 óleos da loja como botões no topo (item avulso); "filtro de óleo" não os mostra; a faixa de orçamento não mostra mais o código interno `SRV-` | #209 |
| ✅ | **A Husqvarna removeu o campo `mainImageData` da API pública**, e a consulta inteira passou a ser recusada: a busca de máquina voltou vazia e o painel da máquina abria sem vistas explodidas. Achado pelo roteiro de Atendimento, não por log. Conserto no ar (#213): 143RII 0→13 resultados, vistas 0→19, peças relacionadas 0→39. Teste de contrato impede a volta do campo antigo | #213 |
| ℹ️ | Os 4–6 s da busca técnica na simulação são a fase "por significado" esperando o Gemini com chave falsa: artefato, não defeito | — |

## D. Decisões do dono (❓) — em `analise-critica.md`
1. ✅ Assistente de IA em gaveta (`ChatPanel`): removido em 2026-10-07 (dono: "faça o que achar melhor"; recomendei tirar).
2. ✅ Tela Histórico: dobrada na busca (últimas buscas) e apagada, autorizado pelo dono em 2026-10-07.
3. ✅ Administração: Negócio, Visão geral (com o registro de ações), Usuários, Qualidade; Feedback tirado, autorizado pelo dono.
4. ✅ Sino de notificações só para administrador (feito, 2026-10-07).
5. ✅ Favoritos: tela, botão e código removidos, autorizado pelo dono.

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
| ✅ | **Verificado na lista de 05/10/2026 (só leitura):** `produtos` = **151 máquinas** (99 a combustão, 39 bateria, 10 robótica, 3 manual; 35 motosserras, 15 roçadeiras, 12 sopradores, 9 cortadores de grama, 5 giro zero…), todas com preço, PNC, modelo, categoria, aplicação (profissional/comercial/ocasional), ficha técnica (cilindrada, potência, tanque, peso…), IPI e foto; 1 marcada `descontinuado`. `updates` = 1.485 novidades entre listas (**82 são de máquinas**: novas ou com preço alterado, ex.: roçadeira 321C de R$ 1.049 para R$ 949). `pecas` traz `modelo`/`pnc` por peça. Ou seja: dá para montar "máquinas em vigência" só com o que já está na lista, sem consultar o Portal |
| ✅ | "Acompanha / não acompanha": vem do Portal Husqvarna por PNC ao abrir a gaveta da máquina; se o Portal não responde, a seção some sem aviso |
| ✅ | **Aba pronta** ("Tabela de preços", para todos): busca por várias palavras sem acento, filtros (tecnologia, categoria, aplicação), "Novidades da lista", ordenar por modelo/preço, gaveta com ficha técnica e descrição, "Abrir vista explodida". Roteiro `tabela-precos-completo.mjs`: 54/54 nos dois temas; e2e 16/16; só texto e número (nenhuma imagem). **Falta importar na produção** (ver abaixo) |
| ❓ | **Aprovar a importação em produção**: `npm run import:machine-list-html -- "<lista.html>"` (só lê) e, aprovado o relatório (151 máquinas), `--apply --expect-count=151`. A migração cria a tabela vazia no deploy |
| ℹ️ | Na lista de 05/10/2026 **a 143R II não está** (só 143RS e 143RST): a tabela passa a responder "essa máquina ainda está em vigência?" |
| ✅ | Quem vê: **todos** (dono, 2026-10-07: "todos podem visualizar isso") |
| ✅ | **Só o preço da lista**, sem dividir por 0,92 (dono, 2026-10-07: "pode deixar somente o preço da lista") |
| ✅ | "Novidades da lista" virou um botão-filtro na própria aba (37 máquinas: novas ou com preço alterado, mostrando "Baixou de / Subiu de") |
| 💡 | Ficha técnica do arquivo é suja (rotação com valor de potência, peso 6500): hoje só entram campos seguros. Rotação, consumo e velocidade ficaram de fora até alguém conferir com a Husqvarna |
| 💡 | Comparar duas máquinas lado a lado (por exemplo, 135 e 143RS) |
| 💡 | Foto da máquina: o arquivo traz imagens, mas o aviso de propriedade intelectual proíbe copiá-las; a foto pode vir do Portal Husqvarna, ao vivo, como em "Acompanha" |
| 💡 | "Tabela de preços" mostra o preço da lista; quando o dono quiser o preço de venda de máquina, é só decidir a regra (hoje não há) |
| ⚠️ | O aviso de propriedade intelectual da lista continua valendo: os dados vão para o BANCO (como os preços de peça, já aprovado), nunca para o repositório |
Dados ficam no banco, nunca no repositório (repo público). Entra depois de A, B e C, antes da auditoria "zero erros" (para a auditoria já cobrir a aba nova).

## J. O que a página da lista de preços faz e vale levar para o site (análise de 2026-10-07)
Pedido do dono: pegar o que for útil da lista, principalmente funcionalidade, "completo mas não poluído". Estudei a página (só o que ela FAZ; nenhum código, texto ou visual dela vai para o repositório, por causa do aviso de propriedade intelectual). Ela tem: busca global com atalho `/` e ranking por relevância, **cadeia de similaridade de códigos**, ficha técnica comercial em PDF e WhatsApp, lista de compras com exportação (CSV para o Portal Parceiro, XLSX, PDF), "Novidades" com preço antes/depois, ordem de categorias definida pela Husqvarna, e dados que NÃO usávamos: `similaridade` (4.224 peças, 120 acessórios, 34 máquinas), `reparo` (preventivo/corretivo) e `modelo`+`pnc` em cada uma das 64.440 peças.
| | Ideia | Situação |
|---|---|---|
| ⏳ | **Código antigo → código vigente** (`similaridade`): a Husqvarna diz quais códigos cada peça substituiu e se existe um mais novo fora da lista. Cliente chega com o código velho: a busca acha o atual, com preço e aviso "substitui X". É a regra "nunca vender o código errado" servida pela própria fonte | PR próprio (tabela nova com RLS + importador + busca + gaveta) |
| ✅ | **Máquina em vigência dentro do atendimento** (feito: selo "Em linha · R$ X" / "Fora de linha" / "Descontinuada" (texto escolhido pelo dono: "fora da lista de preços atual" confundia) no painel da máquina; o PNC vem sozinho da Tabela de preços pelo botão "Abrir vista explodida") | feito |
| ✅ | **Ficha da máquina para o cliente** (WhatsApp e PDF): modelo, preço da lista, ficha técnica, o que acompanha. Reaproveita o PDF e o texto do orçamento | PR próprio |
| ✅ | **"Leve junto"** na gaveta da máquina: acessórios que o PORTAL indica para a máquina e que a loja tem no cadastro (preço e prateleira), com "+ Orçamento". Mudei de "acessórios da categoria" para os do Portal: são os da máquina e não chute por categoria. Cobertura desigual (0 a 18 por máquina): sem item da loja, a seção some | feito |
| ✅ | **Ordem da Husqvarna** na Tabela de preços (tecnologia, categoria e ordem da máquina: motosserra e roçadeira primeiro) em vez de alfabética; vale também para as opções dos filtros | feito |
| 💡 | **Peças de manutenção preventiva por PNC** (`reparo` + `pnc` das 64.440 linhas): cobre as máquinas que o catálogo interno não cobre; só com tabela nova de ligação peça↔PNC | avaliar depois da similaridade |
| ✅ | Atalho `/` para focar a busca: já existia (o plano estava defasado) |
| 💡 | Lista de compras / CSV para o Portal Parceiro: é fluxo de COMPRA, fora do "vista explodida + orçamento"; só se o dono pedir |
| ➖ | Carrossel de destaques, modo cards/tabela, lista de compras salva: enfeite ou fora do escopo; não levar |

## I. Melhorias achadas ao percorrer cada tela (fonte: roteiros de `docs/loja-simulada/`)
Regra: cada tela percorrida entra aqui com o que foi corrigido na hora (✅) e o que fica como ideia (💡) ou decisão (❓).

### Atendimento
| | Achado |
|---|---|
| ✅ | "Buscando…" ficava até 4,5 s depois de a lista já estar na tela: agora libera quando há peças (e a busca nova cancela a anterior, para não misturar resultados) |
| ✅ | "+ 7" solto ao lado dos documentos virou "Mais 7"; "+19 aplicações" saiu da linha (é o "onde usa"); "Ref. HUSQVARNA" (a marca) saiu |
| ✅ | `Button` agora é `type="button"` por padrão: dentro de formulário, "+ Orçamento" podia refazer a busca |
| ➖ | **Copiar todos os códigos do orçamento de uma vez**: construído e **removido** no mesmo dia (dono: o Clipp recebe 1 código por vez; basta copiar o da linha) |
| ✅ | Teclado primeiro (feito): ↓ no campo de busca vai ao código da primeira linha, ↓/↑ percorrem as linhas (na ordem da TELA), Enter copia o código, **+** põe no orçamento, ↑ na primeira volta à busca; `/` e Ctrl K já focavam a busca |
| ✅ | Últimas buscas ao focar o campo vazio (↑/↓, Enter, Esc); a tela Histórico foi apagada |
| 💡 | Linhas se reordenam quando a fase "por significado" acrescenta peças: marcar o que chegou depois, ou só anexar no fim do grupo |
| 💡 | Abrir uma máquina grava a máquina no atendimento sem avisar: mostrar que foi gravada |
| ✅ | Pergunta de óleo: os 4 óleos da loja viram botões no topo (feito antes; o plano estava defasado) |
| ❓ | Contexto (cliente/máquina) sobrevive ao recarregar: manter? hoje fica até "Encerrar atendimento" |
| ✅ | A máquina aparecia duas vezes (atalho da busca e chip "recente"): o "recente" igual ao do atalho ou ao do contexto some (roteiro com prova de mordida) |
| ✅ | **9 diálogos nativos do navegador (`window.confirm`)** trocados por diálogos do próprio site (`ConfirmProvider`); os roteiros reprovam se aparecer um nativo |

### Gaveta da peça
| | Achado |
|---|---|
| ✅ | O Esc que fecha o menu ⋯ fechava a gaveta inteira (tratador global duplicado): corrigido |
| ✅ | **"Registrar conferência"** refeito com o diálogo do shadcn (foco preso, `role="dialog"`, Esc fecha só ele) e sem o texto que explicava o sistema; 9 verificações novas no roteiro da gaveta |
| ✅ | "Leve junto": companheiro sem nome mostrava o código duas vezes ("595353 / 595353"): agora uma vez só |
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
| ✅ | Texto livre para observação no WhatsApp e no PDF: feito (observações editáveis do orçamento) |
| ✅ | Telefone com máscara enquanto digita (`lib/phone.ts`): `(19) 98765-4321`; colar com +55 e traço dá o mesmo |

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

### Telas de administração e secundárias (passada de 2026-10-07)
Todas as telas abaixo receberam: escala `ink`/`--cv-*` alinhadas ao tema novo (mesmo claro e escuro das telas refeitas), **nenhum texto abaixo de 14 px**, sem caixa-alta, sem "kicker" e sem subtítulo que só descreve a tela, títulos no mesmo padrão (`text-3xl`), botões de ação secundária no `Button` do shadcn, diálogos de confirmação do site. **Qualidade** deixou de se chamar "Confiabilidade" no título (o menu já dizia Qualidade). Ainda NÃO foram redesenhadas por dentro: Negócio, Qualidade, Visão geral, Auditoria, Feedback, Favoritos, Histórico, Biblioteca; isso espera as decisões abaixo.

### Telas ainda no estilo antigo (percorridas: abrem e funcionam, 17 verificações)
Todas com texto de 9 a 12 px e frases que explicam o sistema; nenhuma tem erro nem rolagem horizontal.
| Tela | Controles | O que vi |
|---|---|---|
| Favoritos | 2 | ✅ **apagada** (tela, botão e código) |
| Histórico | 50 | ✅ **apagada**: virou "Últimas buscas" no campo de busca; o texto automático "Analise a peça …" do "Perguntar à IA" fica de fora (`lib/recent-searches.ts`, 5 testes) |
| Negócio | 9 | números e gráfico bons; cartões na paleta antiga |
| Visão geral | 6 | números técnicos (catálogos, peças indexadas); agora traz o "Registro de ações" (a antiga Auditoria) |
| Usuários | 8 | ✅ **refeita** (`admin/UsersPanel.tsx`, `admin/AdminPage.tsx`): lista limpa, ações em menu ⋯, confirmação antes de mudar perfil ou bloquear, redefinição de senha em diálogo; 24 verificações. Saiu a coluna "Feedback" |
| Feedback | 5 | ✅ **removida** (0 avaliações registradas). O voto 👍/👎 continua alimentando o ranking; só a tela de leitura saiu |
| Qualidade | 6 | 2.659 caracteres de texto; manter, refazer |
| Auditoria | 1 | ✅ **dobrada** na Visão geral como "Registro de ações"; links antigos (`?tab=audit`) caem lá |

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
