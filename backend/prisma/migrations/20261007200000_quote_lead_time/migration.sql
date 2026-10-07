-- Prazo das peças digitado à mão em cada orçamento ("Imediato", "7 dias úteis"): depende do estoque.
-- Coluna nula = padrão do modelo da loja (IMEDIATO). A tabela Quote já tem RLS ligado.
ALTER TABLE "Quote" ADD COLUMN "leadTime" TEXT;
