# CogniVault — Runbook de Produção

Este documento descreve como publicar, validar, diagnosticar e recuperar o CogniVault sem depender de memória operacional informal.

## 1. Regra de promoção

A branch `main` representa produção. Uma alteração só deve chegar nela depois de:

1. backend verde (`npm audit`, Prisma validate/generate, migrations limpas, testes e gate de busca);
2. frontend verde (`npm audit`, lint e build);
3. E2E verde (login, cookie HttpOnly, reload, busca e isolamento por usuário);
4. revisão do PR;
5. merge na `main`;
6. `production-smoke` confirmar o mesmo SHA no Render e as rotas da Vercel.

Nunca use o smoke de produção como substituto para CI: ele valida publicação, não qualidade lógica.

## 2. Camadas de benchmark

O número de casos não deve ser tratado como sinônimo de cobertura do portfólio.

| Camada | Objetivo | Tamanho |
| --- | --- | ---: |
| CI determinístico | bloquear regressões de recuperação em todo PR | 50 |
| Regressão ampla | checagem frequente contra a biblioteca real | até 500 |
| Homologação/release | validação mais pesada antes de mudanças relevantes | até 2.000 |
| Portfólio | usar todos os casos locais comprovados disponíveis | até 50.000 |

Comandos:

```bash
cd backend
npm run benchmark:parts:ci
npm run benchmark:parts:full -- --tenant=<TENANT_ID>
npm run benchmark:parts:release -- --tenant=<TENANT_ID>
npm run benchmark:parts:portfolio -- --tenant=<TENANT_ID>
```

O benchmark de recuperação não deve chamar Gemini. Cobertura técnica de portfólio é medida separadamente por IPL local/Portal:

```bash
npm run audit:portfolio -- --tenant=<TENANT_ID>
npm run audit:portfolio:portal -- --tenant=<TENANT_ID>
```

Cadastro comercial ajuda a descobrir modelos, mas não é prova de compatibilidade técnica.

## 3. Sessão e autenticação

Produção usa o frontend no domínio Vercel e o backend no Render. O navegador acessa `/api/*` no mesmo domínio da aplicação; a Vercel encaminha a requisição ao Render.

O JWT de sessão fica em cookie:

- `HttpOnly`;
- `Secure` em produção;
- `SameSite=Lax`;
- validade de 8 horas.

O frontend não deve persistir JWT em `localStorage`. Dados locais não secretos (e-mail, perfil e escopo de orçamento) podem permanecer no navegador para isolamento de contexto.

O middleware ainda aceita `Authorization: Bearer` temporariamente para compatibilidade e diagnóstico, mas o login web não devolve o token no JSON.

## 4. Cold start do Render

O serviço gratuito pode suspender por inatividade. A tela de login faz `HEAD /health/live` antes de enviar credenciais e pode aguardar até 75 segundos pelo primeiro wake-up.

Se o primeiro login voltar a falhar:

1. testar `GET /health/live` diretamente;
2. conferir o SHA em `revision`;
3. verificar se o frontend está usando `/api` e `/health` same-origin;
4. confirmar que a Vercel possui os rewrites para o Render;
5. verificar o deploy atual do Render.

## 5. Configuração desejada do Render

O manifesto `render.yaml` declara:

- branch `main`;
- auto deploy após checks aprovados;
- health check `/health/live`;
- Node 22;
- build com `prisma migrate deploy` antes do build.

**Verificação manual obrigatória no dashboard do serviço existente:** o serviço foi criado antes de algumas mudanças do manifesto. Confirme que a configuração efetiva está com:

- Auto-Deploy: `After CI Checks Pass`;
- Health Check Path: `/health/live`.

Se a configuração efetiva estiver como deploy por qualquer commit ou health path vazio, ajuste no dashboard. O conector usado pelo projeto não permite atualizar essas duas propriedades de um serviço já existente.

## 6. Proteção da `main`

Configuração recomendada no GitHub para a branch `main`:

- exigir Pull Request;
- impedir push direto;
- exigir os checks `backend`, `frontend` e `e2e`;
- exigir branch atualizada antes do merge quando houver divergência;
- impedir force-push e exclusão.

A automação atual consegue ler, mas não alterar branch protection/rulesets. Portanto esta configuração deve ser aplicada uma vez em **Settings → Rules → Rulesets** ou **Branches**.

## 7. Backup: o que precisa ser protegido

Uma recuperação completa exige duas classes de dados:

### PostgreSQL

Inclui usuários, catálogo extraído, peças, histórico, feedback, verificações, auditoria, cadastro comercial, cache técnico persistente e demais dados relacionais.

### Storage privado

Inclui os PDFs originais. Um backup apenas do PostgreSQL não recupera os arquivos binários do bucket `catalogos`.

Nunca salve dumps de produção no Git, em artifacts públicos de CI ou em diretórios sincronizados sem criptografia.

## 8. Auditoria de prontidão

Antes de um restore drill ou mudança relevante:

```bash
cd backend
npm run audit:recovery
```

O comando verifica:

- migrations concluídas;
- contagens essenciais;
- documentos ativos sem `storagePath`;
- condições mínimas para reconstrução da aplicação.

Ele não cria backup.

## 9. Backup lógico adicional

Quando for necessário manter uma cópia lógica fora do provedor, execute em uma máquina controlada com PostgreSQL client compatível:

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="cognivault-$(date +%Y%m%d-%H%M).dump"
```

Depois criptografe o arquivo e envie para um destino de backup controlado. Não reutilize o mesmo ambiente de produção como único destino.

A política de retenção do backup gerenciado/PITR do Supabase deve ser conferida no painel do projeto, porque ela depende do plano e não é exposta pelo conector utilizado pelo CogniVault.

## 10. Restore drill

Faça o teste em banco não produtivo.

1. criar PostgreSQL vazio compatível;
2. restaurar o dump:

```bash
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$RESTORE_DATABASE_URL" \
  cognivault-AAAAMMDD-HHMM.dump
```

3. apontar temporariamente `DATABASE_URL` local para o banco restaurado;
4. executar `npx prisma migrate deploy`;
5. executar `npm run audit:recovery`;
6. validar login, busca, catálogo e orçamento;
7. validar a restauração dos PDFs do bucket privado;
8. registrar data e resultado do drill.

Meta operacional inicial: realizar um restore drill ao menos trimestralmente e depois de uma mudança grande de schema/storage.

## 11. Husqvarna / Portal indisponível

Indisponibilidade da fonte oficial significa **inconclusivo**, nunca incompatível.

O fluxo esperado é:

1. responder com evidência local quando ela for suficiente;
2. usar cache oficial recente quando disponível;
3. revalidar em segundo plano quando seguro;
4. pedir PNC/S/N quando variantes realmente mudam a ocorrência técnica;
5. nunca transformar timeout/erro de rede em “peça não serve”.

## 12. IA e limite de custo

Gemini entra depois de regras determinísticas, catálogo, cache e fonte oficial. Os benchmarks de recuperação não devem consumir Gemini.

O painel administrativo deve acompanhar:

- chamadas por tipo;
- tokens usados/restantes;
- hits de cache de decisão;
- cache Husqvarna;
- cobertura técnica conhecida;
- latência p50/p95 quando disponível.

Quando o orçamento diário estiver próximo do limite, o sistema deve degradar para regras/evidência e pedir contexto em vez de inventar resposta.

## 13. Checklist pós-deploy

Depois do merge na `main`:

- CI da `main` verde;
- Render servindo o SHA esperado em `/health/live`;
- Vercel pronta;
- `/login`, `/dashboard`, `/husqvarna` respondendo;
- `/health/live` acessível pelo domínio Vercel (proxy same-origin);
- login real funcionando após cold start;
- nenhum erro novo relevante em logs/runtime.
