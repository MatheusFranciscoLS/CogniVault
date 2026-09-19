-- Campos do ERP da loja (Clipp/CompuFour) na lista comercial.
--
-- Todos anulaveis e sem backfill: a lista de precos importada de planilha nao
-- traz nenhum deles, e a loja nao compra todas as pecas do catalogo. NULL aqui
-- significa "a loja nao informou", nunca "zero" — por isso "stock" e anulavel
-- em vez de DEFAULT 0, que afirmaria que nao ha estoque.
--
-- "lastPurchaseAt" decide se o preco vale como esta ou pede conferencia:
-- compra do mes corrente da loja vale; mes anterior mostra o preco com aviso.
-- Ver backend/src/utils/price-freshness.ts.
ALTER TABLE "MasterPart" ADD COLUMN "stock" INTEGER;
ALTER TABLE "MasterPart" ADD COLUMN "location" TEXT;
ALTER TABLE "MasterPart" ADD COLUMN "lastPurchaseAt" TIMESTAMP(3);
ALTER TABLE "MasterPart" ADD COLUMN "lastSaleAt" TIMESTAMP(3);
