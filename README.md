# CogniVault — PNC + Feedback + Admin V3

Sistema interno para biblioteca de catálogos técnicos e busca inteligente de peças.

## Perfis

### Usuário da loja (`MECHANIC`)
- Consultar o Assistente IA.
- Informar PNC quando necessário.
- Confirmar/corrigir resultados (👍/👎).
- Visualizar e baixar catálogos processados.
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

## Banco / migrations

A V3 acrescenta as migrations de peças/PNC, feedback e segurança administrativa.

Dentro de `backend`:

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

> Em banco de produção, prefira `npx prisma migrate deploy` após validar a migration em desenvolvimento.
>
> Se o Prisma solicitar reset/drop do banco, **não confirme** antes de revisar o motivo.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

A aplicação usa `VITE_API_URL` (veja `frontend/.env.example`).

## Usuários

Os acessos da equipe são criados pelo administrador no painel **Usuários**. Não há rota pública de autocadastro na aplicação.

## Reprocessamento

O PDF local temporário é removido após a indexação. Ao reprocessar, a V3 recupera o original pelo `storagePath` no Supabase, cria um temporário, reindexa as peças e remove o temporário novamente.
