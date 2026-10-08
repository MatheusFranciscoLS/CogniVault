-- Nome de exibição do usuário, para o "ATT." do orçamento (antes deduzido do e-mail, e saía errado). Coluna anulável e sem preenchimento:
-- nulo significa "o administrador ainda não cadastrou o nome".
ALTER TABLE "User" ADD COLUMN "name" TEXT;
