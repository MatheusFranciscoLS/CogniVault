-- Um rascunho por atendente E por tipo: o orçamento de conserto (aba Conserto) é separado do de peças (Atendimento), cada um com a sua cesta.
-- Troca o índice parcial "Quote_one_draft_per_user" (um por atendente) por um por atendente e tipo. Seguro: todo rascunho que já existe tem um tipo só
-- e no máximo um por atendente, então nenhum deixa de caber no índice novo.
DROP INDEX IF EXISTS "Quote_one_draft_per_user";
CREATE UNIQUE INDEX "Quote_one_draft_per_user_kind"
  ON "Quote" ("tenantId", "userId", "kind")
  WHERE "status" = 'DRAFT' AND "userId" IS NOT NULL;
