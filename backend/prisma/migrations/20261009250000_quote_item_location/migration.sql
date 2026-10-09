-- Prateleira da peça no item do orçamento (coluna LOC das planilhas de conserto antigas). Aditiva e anulável. "QuoteItem" já tem RLS ligado.
ALTER TABLE "QuoteItem" ADD COLUMN "location" TEXT;
