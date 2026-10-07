-- Ordem de exibição da própria Husqvarna (tecnologia, categoria, ordem da máquina) na Tabela de preços.
-- Linhas já importadas ficam em 0 até a próxima importação.
ALTER TABLE "MachineListing" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
