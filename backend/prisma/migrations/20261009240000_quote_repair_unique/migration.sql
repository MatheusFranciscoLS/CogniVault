-- Um orçamento de conserto arquivado por atendente e número de OS. Sem isso, dois cliques seguidos em PDF/WhatsApp salvavam ao mesmo tempo, nenhum
-- achava o outro e o arquivo da OS saía duplicado. O Prisma não expressa índice parcial (como o "Quote_one_draft_per_user"): ele não aparece no schema.prisma.
-- Seguro em produção: o tipo REPAIR é novo (nenhuma linha existente entra no índice).
CREATE UNIQUE INDEX "Quote_repair_doc_unique" ON "Quote"("tenantId", "userId", "docNumber")
  WHERE "kind" = 'REPAIR' AND "status" = 'SAVED' AND "docNumber" IS NOT NULL;
