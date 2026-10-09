#!/bin/bash
# Roda todos os roteiros da loja simulada nos dois temas e imprime uma linha por roteiro.
# Uso (de dentro de frontend/): bash ../docs/loja-simulada/todos-roteiros.sh
for r in atendimento-completo busca-modelo login-completo catalogos-completo biblioteca-completo ordem-sabre fonte-publica motor-kohler gaveta-peca-completo maquina-completo orcamento-completo orcamentos-completo usuarios-completo tabela-precos-completo orcamento-maquina troca-codigo-completo teclado-completo telas-restantes maquina-motor motor-orcamento lista-precos-atualizar catalogos-motores buscas-sem-resultado pecas-de-revisao; do
  for t in dark light; do
    saida=$(node ../docs/loja-simulada/$r.mjs $t 2>&1)
    resumo=$(echo "$saida" | grep -E "verificações passaram" | tail -1)
    falhas=$(echo "$saida" | grep -E "^FALHOU|^FAIL" | head -3)
    echo "$r $t: ${resumo:-SEM RESUMO}"
    [ -n "$falhas" ] && echo "$falhas"
  done
done
echo FIM
