# Manter o servidor acordado (e por que o GitHub não resolve)

O plano gratuito do Render dorme o serviço depois de **15 minutos** sem tráfego
HTTP. A primeira requisição depois disso paga um cold start de dezenas de
segundos — é o "Preparando o servidor" que o atendente vê com o cliente na
frente.

## O keepalive do GitHub Actions não funciona

Medido em 2026-09-19. O workflow está agendado para cada 10 minutos, e as
execuções reais foram:

    13:37 → 09:56 → 01:11 → 23:13 → 21:03 → 18:21 → 15:06
         3h41    8h45     1h58     2h10     2h41     3h15

O cron do GitHub Actions é **best effort**: em repositório com pouca atividade,
execuções agendadas são descartadas. Não há configuração que conserte isso.

**A prova do efeito** está nas métricas do Render: entre 18/09 18h e 19/09 16h
apareceram **11 IDs de instância diferentes** (`-s6hv2`, `-75tjl`, `-p5svx`,
`-bvzw6`, `-gkj7n`, `-9dtql`, `-c2bmq`, `-86689`, `-2bqp6`, `-cbwtd`, `-gfc6z`).
Cada ID novo é uma instância nova, ou seja: **11 cold starts em 22 horas**, um a
cada ~2 horas — exatamente o intervalo real do keepalive.

O `CLAUDE.md` afirmava que o workflow "pinga a cada 10 min". Nunca foi verdade
na prática.

## A solução: UptimeRobot (gratuito)

Escolha do dono. 5 minutos de intervalo, que é folgado contra os 15 minutos do
Render, e de brinde avisa por e-mail se a API cair.

### Passo a passo

1. Criar conta em **uptimerobot.com** (plano Free, sem cartão).
2. **+ New monitor**.
3. Preencher:

   | campo | valor |
   |---|---|
   | Monitor Type | `HTTP(s)` |
   | Friendly Name | `CogniVault API` |
   | URL | `https://cognivault-api.onrender.com/health` |
   | Monitoring Interval | `5 minutes` |

4. Em **Advanced settings**, subir o **Request timeout** de 30s para **60s**.
5. Salvar. Pronto — não há nada a fazer no código.

### Não aceite 503 como "up"

Esta seção dizia para aceitar `200` e `503`, "porque o `/health` responde 503
quando só a fila está degradada". **Lido no código (`app.ts`), é o contrário:**

    res.status(databaseReady ? 200 : 503)

Fila degradada responde **200** com `status: 'degraded'` no corpo. O 503 sai
**só quando o Postgres não responde** — que é exatamente o caso em que você quer
receber o e-mail. Deixe o padrão do UptimeRobot (só 2xx é "up").

### O HTTP method pode ficar em HEAD

O UptimeRobot sugere `HEAD` por ser mais leve, e aqui ele serve. Não existe
`app.head('/health')`, mas o Express manda HEAD para o handler do GET: o
handler roda inteiro, inclusive a consulta ao Postgres. A prova é o próprio
código de status — 200 contra 503 é decidido por essa consulta, então um HEAD
que volta 200 só pode ter consultado o banco.

Medido em 2026-09-19 contra a API de produção:

    HEAD /health  -> 200 em 22,0s   (servidor dormindo: cold start)
    GET  /health  -> 200 em  0,28s  ("uptimeSeconds": 13)

Os 22 segundos são o "Preparando o servidor" que o atendente vê — o servidor
estava dormindo naquele momento. E são o motivo do timeout de 60s: 22s passa
nos 30s padrão, mas sem folga nenhuma, e um cold start mais lento (ou um deploy
em andamento) marcaria a API como fora do ar sem ela estar.

### Por que `/health` e não `/health/live`

`/health` **consulta o Postgres de verdade**. O Supabase gratuito pausa o
projeto depois de ~7 dias sem nenhuma consulta ao banco, e é um problema
diferente do sleep do Render. Um ping que só acorda o processo não evitaria essa
pausa numa baixa longa (feriado, férias). `/health/live` não toca o banco.

### Consumo do plano gratuito do Render

O free tem 750 horas de instância por mês. Manter acordado 24/7 dá ~744 h, que
cabe — mas no limite, e sem folga para outro serviço.

Se aparecer um segundo serviço no Render, restrinja o monitor ao horário da
loja: 11 h por dia × 30 dias ≈ 330 h. O UptimeRobot free não tem janela de
horário, então nesse caso a alternativa é um Cloudflare Worker com cron
(também gratuito).

## O que fica no repositório

`.github/workflows/keepalive.yml` continua existindo como **rede de
segurança**, não como solução: custa zero e, mesmo irregular, acorda o banco
algumas vezes por dia, cobrindo o risco de pausa do Supabase. O comentário no
topo do arquivo diz isso, para ninguém voltar a confiar nele.
