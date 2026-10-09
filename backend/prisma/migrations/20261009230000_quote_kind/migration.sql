-- Orçamento de conserto: tipo do orçamento, número digitado (OS/DAV do Clipp) e prazo por linha. Aditiva: orçamento existente fica PARTS, sem número e com o prazo do orçamento.
-- As tabelas "Quote" e "QuoteItem" já têm RLS ligado.
ALTER TABLE "Quote" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PARTS';
ALTER TABLE "Quote" ADD COLUMN "docNumber" TEXT;
ALTER TABLE "QuoteItem" ADD COLUMN "leadTime" TEXT;
CREATE INDEX "Quote_tenantId_kind_docNumber_idx" ON "Quote"("tenantId", "kind", "docNumber");
