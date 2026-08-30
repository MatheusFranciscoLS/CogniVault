# CogniVault V6 — operação de balcão e inteligência de peças

Sistema interno para biblioteca de catálogos técnicos e busca inteligente de peças.

## Perfis

### Balcão (`MECHANIC` no código)
- Consultar o Assistente IA.
- Informar modelo, PNC e número de série quando necessários.
- Confirmar/corrigir resultados (👍/👎).
- Buscar por peça, código, modelo e PNC.
- Usar histórico, favoritos, detalhes e compatibilidade.
- Visualizar e baixar catálogos processados no leitor interno.
- **Não pode** enviar, arquivar, restaurar, excluir ou reprocessar PDFs.
- **Não pode** administrar usuários.

### Administrador (`ADMIN`)
Além das funções acima:
- Painel com quantidade de catálogos, peças, usuários e feedback.
- Upload de PDFs.
- Reprocessamento de catálogo.
- Arquivamento e restauração de catálogo.
- Exclusão do arquivo PDF quando ele realmente não deve mais permanecer no storage.
- Gestão de usuários e perfis.
- Auditoria das ações administrativas.
- Painel de qualidade, revisão de metadados e benchmark da busca.

## Segurança de catálogos

O CogniVault diferencia **arquivar** de **excluir PDF**:

- **Arquivar** é reversível: o catálogo sai das consultas e buscas, mas o PDF permanece armazenado e pode ser restaurado por um administrador.
- **Excluir PDF** é irreversível para o arquivo: o conteúdo é removido do storage e deixa de participar da operação. O registro histórico/auditoria é preservado para rastreabilidade.

O backend aplica as permissões independentemente do frontend. A conta é revalidada no banco em cada requisição, então bloqueios e mudanças de perfil têm efeito imediato.

Os PDFs são acessados por signed URL do Supabase quando `storagePath` está disponível. O bucket `catalogos` deve permanecer privado.

> A interface apresenta somente os perfis **Administrador** e **Balcão**. `MECHANIC` é apenas o identificador interno legado do perfil Balcão.

## Confiabilidade da busca

- Part Numbers exibidos vêm dos registros estruturados de peças; memória técnica e IA servem para interpretação, contexto e ranking.
- Modelo, PNC, número de série, vista e posição podem atuar como restrições técnicas quando há evidência no catálogo.
- Quando a evidência é insuficiente ou há variantes incompatíveis, o sistema deve pedir confirmação em vez de inventar um código.
- Substituições oficiais registradas manualmente preservam histórico e priorizam o código atual somente quando a compatibilidade técnica é mantida.

## Saúde e produção

- Frontend: Vite + React na Vercel.
- Backend: TypeScript compilado em JavaScript no Render.
- Dados: PostgreSQL + Prisma.
- Catálogos: Supabase Storage privado.
- Processamento assíncrono: RabbitMQ.
- `GET /health/live`: processo HTTP ativo.
- `GET /health`: readiness de PostgreSQL e RabbitMQ; retorna `503` quando uma dependência essencial está indisponível.

A integração da Vercel reserva deployments automáticos para `main`; branches de feature/promoção são validadas pelo GitHub Actions sem consumir builds de preview desnecessários.

## Banco / migrations

A V6 inclui as migrations de peças/PNC, feedback, segurança administrativa, qualidade e operação diária.

Dentro de `backend`:

```bash
npm ci
npx prisma generate
npm run build
npm start
```

> Em banco de produção, use apenas migrations revisadas com `npx prisma migrate deploy`.
>
> Nunca use `prisma migrate reset`, `db push --accept-data-loss` ou qualquer fluxo que apague dados.

## Frontend

```bash
cd frontend
npm ci
npm run lint
npm run dev
```

No Windows, se o npm global estiver bloqueado por `EPERM`, use um cache dentro do próprio workspace em vez de executar como Administrador:

```powershell
npm ci --cache .npm-cache
```

O cache local pode ser removido depois e não deve ser versionado.

A aplicação usa `VITE_API_URL` (veja `frontend/.env.example`).

## Usuários

Os acessos da equipe são criados pelo administrador no painel **Usuários**. Não há rota pública de autocadastro na aplicação.

## Reprocessamento

O PDF local temporário é removido após o processamento. Ao reprocessar, o backend recupera o original pelo `storagePath` no Supabase, cria um temporário, reextrai/indexa o catálogo e remove o temporário novamente.

O comando administrativo de atualização de memória técnica é diferente de reprocessamento: ele reaproveita as peças já extraídas para recalcular memória, categoria e saúde sem reabrir o PDF e sem consumir Gemini para uma nova extração.
