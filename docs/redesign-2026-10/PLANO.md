# CogniVault — plano de melhorias (reformulado em 2026-10-09)

Substitui o plano antigo (`PLANO-historico.md`, 315 linhas escritas por acréscimo). Este é o plano **vivo**: curto, em ordem de prioridade, e atualizado a cada rodada.
Detalhes técnicos e decisões do dono, com data, ficam em `CLAUDE.md` (raiz). O histórico do que foi medido e achado fica em `PLANO-historico.md`.

Legenda: ✅ feito · 🔧 em andamento · ⏳ a fazer · 🕐 espera dado ou data · ❓ decisão do dono · ⏸ adiado a pedido do dono

## Como trabalhamos (regras do dono, valem para tudo)

1. **A lista de preços é o foco.** Toda melhoria passa por "isso toca a lista?". Conflito de preço no arquivo só o dono decide (`OWNER_PRICE_DECISIONS`).
2. **Sistema perfeito e sem erros ANTES do Clipp.** O Clipp fica adiado até ele dizer.
3. **No máximo 2 frentes ao mesmo tempo.** Uma é a de prioridade mais alta; a outra é a rodada de auditoria. O resto espera na fila.
4. **Testar de várias formas** e dizer o que NÃO foi verificado (modelos e marcas diferentes, entrada estranha, vazio, os dois temas, o caso em que nada deve aparecer, prova por mordida).
5. **Gravar em produção é clique do dono**, pela tela. Eu preparo, mostro o relatório e confirmo depois. **Custo zero.** O repositório é público: dado da loja, cliente e arquivo da Husqvarna nunca entram nele.
6. **Balcão: o atendente quer a peça, não a explicação.** Tela do balcão sem texto que explique o sistema; laranja só para ação; o que o cliente recebe não leva código de peça.
7. **Nada de PR aberto por muito tempo:** um assunto, um PR, mescla, confere a ponta e confere que a produção publicou.

## 1. Onde estamos (2026-10-09)

Plano antigo: 110 itens feitos contra ~10 a fazer, 22 ideias guardadas e 6 decisões do dono. Resumo do que existe e funciona:

- **Atendimento:** busca única (peça + máquina), vista explodida da Husqvarna, Briggs, Kawasaki e Kohler dentro do app, troca de código automática pelo Portal, orçamento no banco com WhatsApp e PDF no modelo da loja (sem código), motor ligado à máquina e ao orçamento, peças de revisão por máquina.
- **Lista de preços:** importação com relatório e aprovação, **tela de atualização no Negócio** (lê o arquivo no navegador), preço decidido pelo dono, aviso de mudança grande, **desfazer a última atualização**, peças de revisão carregadas junto, tabela de máquinas com foto.
- **Administração:** Negócio (inclui buscas sem resultado e peças de motor sem preço), Qualidade (cobertura 100% dos modelos em linha), Visão geral, Usuários, Biblioteca, Registro de ações em português.
- **Confiança:** vigia semanal dos fornecedores, `Production Smoke` abre issue se a Render não publicar, rodada de auditoria em um comando (`docs/loja-simulada/auditoria-rodada.sh`), 25 roteiros de navegador nos dois temas.
- **Produção já carregada pelo dono:** máquinas (151, com foto) e peças de revisão (3.552). Falta só o relatório do 594028101 (ver 2.1).

## 2. Fila de trabalho, em ordem

### P0 — Lista de preços (foco)
| | Item |
|---|---|
| ⏳ 2.1 | **Conferir a próxima atualização:** ao subir o arquivo de 05/10 de novo, o relatório deve mostrar "Preço decidido por você" e **1 preço muda (9.171 → R$ 10,87)**. O dono aprova; eu confiro depois. |
| ✅ 2.2 | **Arquivo suspeito não grava:** linhas sem código ou com preço fora do padrão acima de ~5% travam o botão (no servidor também); preço **R$ 0,00** deixa de ser aceito (vira "preço fora do padrão"). | **Feito (2026-10-09):** `fileProblem` trava o relatório e a gravação (no servidor também) acima de 5% de linhas ilegíveis ou arquivo sem peça; R$ 0,00 é preço fora do padrão.
| ✅ 2.3 | **Lista testada de várias formas (2026-10-09):** 12 cenários de leitura (formatos de preço aceitos e recusados, código escrito de jeitos diferentes, mesmo código em duas listas, linha que não é linha, descrição vazia, chaves extras, lista obrigatória ausente, 1.000 linhas repetidas, 120 mil linhas em ~0,2 s, NCM/EAN) sem achar defeito no leitor; **escala** em Postgres (1.250 preços + 1.250 códigos novos atravessam os lotes de 400; 2.500 peças de revisão atravessam os de 1.000); **pior caso medido** com a lista real na loja simulada: TODOS os 22.288 preços +8% gravam em 3,4 s, desfazem em 3,4 s e voltam **exatamente** ao que eram (mesma contagem e mesma soma). **Não medido:** o tempo na Render free (CPU bem menor) e o limite de tempo do proxy da Vercel; por isso, se a rede cair na hora de gravar, a tela manda conferir a "Última atualização" em vez de afirmar que nada foi gravado. |
| ✅ 2.4 | **O que a lista traz e a loja ignora** (decidido com o dono em 2026-10-09): entra a **aplicação ("serve em") dos acessórios**; **EAN, NCM e IPI ficam de fora** (a loja não usa leitor de código de barras e não precisa do dado fiscal). Falta só o dono atualizar a lista pela tela para preencher os 254 acessórios que já estão na loja. |
| ⏳ 2.5 | **Loja simulada mais fiel à produção:** hoje ela tem 22.288 códigos e a produção 26.694 (os 4.406 de motor e outras marcas só existem lá), 57.797 seções de preço contra 29.134, 61 catálogos e 20.694 peças lidas contra 70 e 18.078, e orçamentos inventados (108 contra 2 reais). Aproximar o que dá (por exemplo, trazer os 4.406 códigos de preço da produção, que são dado da loja e não de cliente) sem copiar dado de cliente. |

### P1 — Erros e robustez (a rodada de auditoria)
| | Item |
|---|---|
| 🔧 2.6 | **Rodada de auditoria a cada funcionalidade grande** e, no mínimo, semanal: `bash docs/loja-simulada/auditoria-rodada.sh` (e a suíte de roteiros). Achados entram aqui com a data. |
| ✅ 2.7 | **Rodada 2 (lógica)** feita em 2026-10-09 em três passadas: **4 defeitos achados e corrigidos** (duas abas se apagavam; edição sem rede perdia para o servidor; a cesta de conserto vazava entre atendentes do mesmo PC; emoji/árabe/japonês estragava o PDF do cliente) e **rede lenta e partida a frio sem defeito** (guardadas como regressão). Roteiros `rodada2-abas-sessao`, `pdf-texto-estranho`, `rodada2-rede-lenta`. Sobra só: dois APARELHOS editando a mesma cesta (precisaria de versão no servidor). Repetir a rodada a cada funcionalidade grande. |
| ✅ 2.8 | **Índice de peças de motor com cache quente:** decidido **não mexer**. O índice só é limpo à mão e se repovoa sozinho quando o cache do motor vence (7 dias) ou na próxima leitura de um motor novo; reindexar a partir do cache custaria código e teste para um caso que não acontece em produção. Reabrir se alguém limpar `OfficialPartIndex`. |

### P2 — Melhorias do balcão (pequenas, uma de cada vez)
| | Item |
|---|---|
| ✅ 2.9 | Lembrar a última vista aberta de cada máquina (por aparelho; vista que sumiu cai na primeira). |
| ✅ 2.10 | Destacar a linha ao passar o mouse (ou focar) numa posição do desenho, e a posição ao passar na linha; a posição em destaque sobe para a frente. |
| ✅ 2.11 | Filtro por nome nos conjuntos da Kawasaki (aparece com mais de 8), com "Mostrar todos" quando nada casa. |
| ✅ 2.18 | **Item avulso com código** (1ª fase dos 3 tipos de orçamento): o formulário "Serviço ou item avulso" ganhou "Código da peça (opcional)". Husqvarna, Briggs, Kawasaki e Kohler preenchem descrição (e preço, se a loja tem); qualquer outro fornecedor não puxa nada e o balcão escreve. **Fica aberto para vários itens em sequência** (manutenção nunca é um item só) e o código vale com ou sem traço e espaço. |
| ✅ 2.21 | **Orçamento de peças no padrão do de máquinas** (1ª parte): prévia do PDF com data, assunto e validade editáveis e impressão do mesmo documento; "Pronta entrega" no lugar de "Imediato" e a observação acompanha o prazo (aviso se o texto digitado contradiz); desconto só 5% PIX + campo livre. Falta: o mesmo cuidado no tipo "Conserto" (2.19) e a prévia também no orçamento da máquina. |
| ✅ 2.19 | **Aba Conserto separada** (modelo "ORÇAMENTO DAV" da loja): tela própria com a PRÓPRIA cesta (rascunho por atendente e por tipo, sem seletor Peças/Conserto), editor que segue a foto da planilha (OS digitada, cliente, linhas com prazo por linha, mão de obra, total sempre à vista), pasta por OS (salvar o mesmo número atualiza), filtro de tipo e busca pela OS em Orçamentos. **Condição de pagamento** dos três orçamentos: À vista, A prazo 30 dias ou texto livre; sem PIX 5% nem desconto automático. **Orçamento de peças em card central grande**, sem mão de obra nem revisão geral (isso é do conserto). Migração `20261009260000`. |
| ✅ 2.22 | **Orçamentos de conserto antigos importados** para a pasta (1.679 OS de 2019 a 2026), pela tela do administrador, com relatório antes de gravar; prateleira (LOC) guardada por linha. Falta só o dono rodar em produção (clique dele).
| ✅ 2.27 | **Uso recomendado no orçamento de máquina** (site público da Husqvarna): classe de uso (motosserra e soprador) e sabres compatíveis entram como características marcadas; só o que a Husqvarna escreve, nada deduzido. Roçadeira e demais categorias não têm esse dado no site. Medido em 76 modelos; 11 não estão no site. |
| ✅ 2.24 | **Sugestões a partir do que já foi orçado** (conserto): "já orçado antes" ao digitar (valor de referência pela mediana das últimas 10 vezes, prazo comum, quantas OS) e "costuma levar junto" depois de lançar uma peça (nunca mão de obra). Teclado: setas, Enter só escolhe com opção marcada, Esc fecha. |
| ✅ 2.25 | **Painel "Mais orçadas no conserto"** no Negócio (administrador): o que mais se orça por período (3 meses, 12 meses, tudo), só peça, com valor de referência e prazo do período, para guiar o estoque. |
| ✅ 2.26 | **Aviso de valor fora do costume** no conserto: o valor digitado que é o triplo (ou menos de um terço) do que a loja costuma cobrar naquela linha (5 OS ou mais) mostra "Costuma ser R$ X: confira o valor", sem bloquear. |
| ✅ 2.23 | **Prévia do PDF no orçamento de máquina**: o botão Prévia mostra o PDF do cliente ao lado do formulário, refeito a cada ajuste, com Imprimir; baixar usa a mesma montagem. |
| ❓ 2.20 | **Vista explodida da Branco** (`branco.ricambio.net`): o `robots.txt` do catálogo **proíbe** robôs em `/site/pagece5.wplus`, que é exatamente a página do desenho. Sem leitura automática. Saídas: botão que abre o catálogo da Branco numa aba (o atendente navega) ou pedir à Branco uma exportação/autorização. Decisão do dono. |
| 💡 | "Tentar de novo" quando o PDF não abre; mostrar que a máquina aberta ficou gravada no atendimento; marcar peças que chegam depois pela fase "por significado". |
| 💡 | Comparar duas máquinas lado a lado; "Selecionar todas desta vista" copiando só os códigos. |

### P3 — Dependem de dado ou do dono
| | Item |
|---|---|
| 🕐 2.12 | **Analisar as buscas sem resultado** (a tabela só começa a encher com o uso real): por volta de **16/10**. Separar o que é peça que falta no cadastro do que é jeito diferente de falar, e só então ajustar a busca. |
| 🕐 2.13 | **Aprender com os orçamentos** ("quem orçou esta máquina costuma levar..."): precisa de bem mais que os 2 orçamentos reais de hoje. |
| ✅ 2.14 | ~~Juntar as seções duplicadas da Biblioteca~~: **não existia em produção** (conferido por leitura em 2026-10-09: as 12 seções são distintas). Era só da loja simulada, que tinha "Roçadeiras" e "ROÇADEIRA". |
| ❓ 2.16 | Pares máquina → motor que o dono for informando (`OWNER_BASE_ENGINES`); Z460 continua sem motor definido. |
| ❓ 2.17 | Regra de preço de venda da máquina (hoje é o da lista, sem ÷ 0,92); lista de compras do Portal Parceiro (só se pedir). |

### Penúltimo: redesenho visual das telas de Administração (decidido com o dono em 2026-10-09)
| | Item |
|---|---|
| 🔧 2.15 | **Redesenho: o dono escolheu a direção B ("Painel de bancada") e quer o MESMO padrão em TODO o site, não só na Administração** (2026-10-09). Mockups em `docs/redesign-2026-10/mockups/` (Administração: Negócio e Qualidade; balcão no tamanho real 1366×768: Atendimento, Conserto, Tabela de preços, Orçamentos). Regras do balcão que o padrão respeita: faixa MAIS BAIXA que a da Administração (a tela tem 768 px), campos de trabalho dentro da faixa (busca, OS, cliente, filtros), laranja só em ação, nenhum texto explicando o sistema, claro e escuro. **Ordem de entrega, uma tela por PR e mostrada antes de seguir:** (1) base compartilhada (faixa, abas, cartão, número grande, tabela, chip) com teste de contraste; (2) Administração (Negócio, Qualidade, Visão geral, Usuários, Registro); (3) Orçamentos e Tabela de preços; (4) Conserto; (5) Atendimento (por último e com mais cuidado: é a tela mais usada e a que não pode ficar mais lenta); (6) Catálogos e login. Aguarda o OK do dono para começar. | **Andamento (2026-10-10): base, Negócio (#314), Qualidade (#315) e Visão geral (com o Registro de ações dentro) entregues**; falta Usuários, Orçamentos, Tabela de preços, Conserto, Atendimento, Catálogos e login.

### Último: o Clipp (sempre o último)
| ⏸ | **Clipp:** exportação de produtos pela tela do Clipp (Referência, preço, descrição complementar, última compra, estoque), importador testado em banco descartável, aprovação do dono e só então gravar. Os campos de loja já existem em `MasterPart` e vazios. Prioridade alta quando entrar: ~1.289 peças de motor sem preço. |

## 3. Rodada de auditoria (como fazer, sempre igual)

1. `bash docs/loja-simulada/auditoria-rodada.sh --rapida` (≈ 2 min): tipos, eslint de auditoria, dependências, toda rota exige login, rota sem consumidor, produção serve a `main` e protege as rotas novas.
2. Sem `--rapida` (≈ 6 min): + Vitest, build e a suíte do backend na loja simulada (só os 3 testes de RabbitMQ ficam de fora, porque precisam de broker).
3. `cd frontend && bash ../docs/loja-simulada/todos-roteiros.sh` (≈ 1 h, loja simulada no ar): todos os roteiros nos dois temas. Falha que não é regressão (índice limpo, internet) se explica na hora.
4. Logs de produção dos últimos 7 dias (`list_logs`, nível erro): o que não for queda de rede da Render é defeito.
5. **Cada achado vira** correção + teste que o trava (provado por mordida) + uma linha em `CLAUDE.md` quando muda uma regra.

## 4. O que a loja simulada é (e não é)

É um Postgres local com **as migrações reais aplicadas em ordem** (só as colunas de `pgvector` viram texto), a lista de preços e a tabela de máquinas reais, usuários de teste e orçamentos inventados. Serve para tudo que depende de **esquema e lógica**.
**Não** testa: RabbitMQ (3 testes só no CI), leitura de PDF por IA e busca semântica (Gemini e `pgvector` ausentes), Supabase Storage, limites do proxy da Vercel e a partida a frio da Render, e o **volume e as manias dos dados reais** (ver 2.5: a produção tem 26.694 códigos e 70 catálogos reais; a simulação, 22.288 e 61 catálogos de teste). Por isso toda funcionalidade que grava em produção termina com uma conferência pelo dono (relatório + clique) e uma checagem de contagem depois.
