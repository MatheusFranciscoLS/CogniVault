# Análise crítica do CogniVault (2026-10-07)

Pedido do dono: *"quero o melhor site possível; vamos usar todos os dias e a todo
momento na loja; o que não for necessário pode excluir"*. E a definição de produto que
ele deu: **este site cuida da vista explodida e do orçamento; a venda de verdade
acontece no sistema da loja** (Clipp). Por isso o código precisa ser copiado em um
clique, e tudo que não ajuda nisso é ruído.

## O que os dados de produção dizem (consulta só de leitura, 2026-10-07)

| Medida | Valor |
|---|---|
| Usuários no banco | **1** (o administrador) |
| Buscas guardadas | 58 em 40 dias (máx. 15 num dia) |
| Orçamentos | 2 (1 rascunho, 1 salvo) |
| Favoritos | **0** |
| Localização física cadastrada | **0** |
| Conferência oficial registrada | **0** |
| Reservas de IA interativa | **0** |
| "Feedback" | 1.122, **todos "correto", de uma só pessoa em 8 dias** (teste, não opinião) |
| Auditoria | quase toda envio e reprocessamento de catálogo (admin) |

**Leitura correta (confirmada pelo dono):** o sistema **ainda está em construção** e não
entrou em uso na loja. Os zeros acima não dizem nada sobre o que o balcão quer, e **nenhum
corte desta análise se apoia neles**. A decisão vem do **trabalho do balcão** (achar a
peça, ver a vista explodida, copiar o código, orçar). Como não há uso real para observar,
o teste é feito numa **loja simulada** (banco descartável com os preços reais da lista da
Husqvarna), não em produção.

## Critério

Uma coisa fica à mostra se ajuda a (1) achar a peça certa, (2) conferir onde ela está
na vista explodida, (3) copiar o código, (4) montar e enviar o orçamento. O resto sai da
tela. "Sai da tela" quer dizer **código e tela**, não banco: tabelas e rotas não são
apagadas (reversível pelo git, sem risco para a produção).

## Veredito por parte

### Fica e é refeito
| Parte | Por quê |
|---|---|
| Busca (Atendimento) | é o trabalho principal; **refeito** (PR #209) |
| Linha de resultado | código, nome, preço, um botão; **copiar código** ganha lugar de destaque |
| Gaveta "Detalhe da peça" | refeita para o novo trabalho (ver abaixo) |
| Gaveta de orçamento, Orçamentos salvos | metade do trabalho do site |
| Catálogos / vista explodida | a outra metade; é o que a loja não tem em outro lugar |
| Painéis Kawasaki/Briggs, vista explodida oficial | resolvem motor de terceiros, que o balcão pergunta |
| "Leve junto" e óleo | vendem junto (junta com carburador, óleo 2T) |
| Aviso de código substituído | **não pode sumir**: evita vender a peça errada |
| Login | refeito no mesmo visual |

### Sai do balcão (código e tela)
| Parte | Evidência / motivo |
|---|---|
| "Onde usa?" | dito pelo dono: *"ta pra orçar a roçadeira, não faz sentido"* |
| "Também serve em" (chips da Husqvarna) | mesmo motivo; poluía a gaveta |
| Bloco "Confiabilidade / Esta peça foi conferida?" e as 3 etiquetas de origem | informação sobre o sistema, não sobre a peça |
| "Localização física" com botão "Cadastrar" | a prateleira virá do Clipp; aí aparece como texto, só quando existir |
| WhatsApp **por peça** | o WhatsApp é do orçamento, não da peça |
| "Favoritar peça" e a tela Favoritos | o balcão guarda a peça no orçamento e a máquina no contexto; favorito é um terceiro lugar para a mesma coisa |
| "Costumam sair junto" separado | duplica "Leve junto"; vira uma lista só |

### Vai para o menu "⋯" (raro, mas existe)
Ver na Husqvarna, Registrar conferência (a aprovação continua em Qualidade), Perguntar à IA.

### Decisão do dono (não decidi sozinho)
1. **Assistente de IA em gaveta** (`ChatPanel`, ~1.100 linhas com os cartões de resposta):
   A IA que ajuda de verdade já é **automática e quieta** (palpite de peça quando
   a busca vem vazia). A gaveta de conversa é o mais perto do "chutar código" que o
   produto jurou nunca fazer. Recomendo **tirar**; mas é a cara do nome "CogniVault".
2. **Histórico** (tela): Recomendo dobrar na própria busca (últimas buscas ao
   focar o campo) e apagar a tela. O e2e que prova o fabricante da peça usa essa tela e
   precisa ser reescrito antes.
3. **Painéis de administração** (Visão geral, Negócio, Usuários, Feedback, Qualidade,
   Auditoria): só o dono usa. Recomendo manter **Negócio, Usuários e Qualidade**, juntar
   **Visão geral + Auditoria** e **tirar Feedback** (dados de teste, e sem o
   assistente não há onde dar feedback).
4. **Sino de notificações**: para o balcão não diz nada. Só para administrador.

## Ordem de execução
1. Linha da lista + gaveta de detalhe (esta etapa)
2. Gaveta de orçamento e lista de orçamentos
3. Catálogos (vista explodida) e fim de Favoritos/Histórico
4. Login
5. Administração
6. Depois de tudo: auditoria "zero erros"; só então o Clipp
