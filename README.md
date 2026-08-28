# CogniVault V6 — operação de balcão e inteligência de peças

Sistema interno para biblioteca de catálogos técnicos e busca inteligente de peças.

## Perfis

### Balcão (`MECHANIC` no código)
- Consultar o Assistente IA.
- Informar PNC quando necessário.
- Confirmar/corrigir resultados (👍/👎).
- Buscar por peça, código, modelo e PNC.
- Usar histórico, favoritos, detalhes e compatibilidade.
- Visualizar e baixar catálogos processados no leitor interno.
- **Não pode** enviar, arquivar, restaurar ou reprocessar PDFs.
- **Não pode** administrar usuários.

### Administrador (`ADMIN`)
Além das funções acima:
- Painel com quantidade de catálogos, peças, usuários e feedback.
- Upload de PDFs.
- Reprocessamento de catálogo.
- Arquivamento e restauração de catálogo.
- Gestão de usuários e perfis.
- Auditoria das ações administrativas.

## Segurança de catálogos

A interface não possui exclusão definitiva. A ação de retirada é **Arquivar**. Um catálogo arquivado:
- deixa de aparecer para usuários;
- deixa de participar das buscas da IA;
- permanece no banco/storage e pode ser restaurado por um administrador.

O backend aplica as permissões independentemente do frontend. A conta é revalidada no banco em cada requisição, então bloqueios e mudanças de perfil têm efeito imediato.

Os PDFs são acessados por signed URL do Supabase quando `storagePath` está disponível. O bucket `catalogos` deve permanecer privado.

> A interface apresenta somente os perfis **Administrador** e **Balcão**. `MECHANIC` é apenas o identificador interno legado do perfil Balcão.

## Saúde e produção

- Frontend: Vite + React na Vercel.
- Backend: TypeScript compilado em JavaScript no Render.
- Dados: PostgreSQL + Prisma.
- Catálogos: Supabase Storage privado.
- Processamento assíncrono: RabbitMQ.
- `GET /health/live`: processo HTTP ativo.
- `GET /health`: readiness de PostgreSQL e RabbitMQ; retorna `503` quando uma dependência essencial está indisponível.

## Banco / migrations

A V6 inclui as migrations de peças/PNC, feedback, segurança administrativa e operação diária.

Dentro de `backend`:

```bash
npm install
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
npm install
npm run lint
npm run dev
```

A aplicação usa `VITE_API_URL` (veja `frontend/.env.example`).

## Usuários

Os acessos da equipe são criados pelo administrador no painel **Usuários**. Não há rota pública de autocadastro na aplicação.

## Reprocessamento

O PDF local temporário é removido após a indexação. Ao reprocessar, a V3 recupera o original pelo `storagePath` no Supabase, cria um temporário, reindexa as peças e remove o temporário novamente.
