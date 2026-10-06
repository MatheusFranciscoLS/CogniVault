import rateLimit from 'express-rate-limit';

/**
 * Trava de força bruta no login.
 *
 * **`skipSuccessfulRequests` é o ponto todo.** Sem ele o contador somava
 * *qualquer* login, inclusive os que deram certo — e a loja inteira sai por um
 * único IP público (NAT). Com vários atendentes em tablets e PCs, o teto de 10
 * era do **prédio**, não da pessoa: bastava o pessoal entrar no começo do turno
 * para o próximo ficar 15 minutos sem conseguir logar, com cliente no balcão.
 *
 * A sessão dura 8 h e não renova sozinha, o que junta todo mundo na mesma
 * janela: quem entrou de manhã é deslogado mais ou menos junto, à tarde, e
 * tenta voltar ao mesmo tempo.
 *
 * Contar só o que falha é o que a trava sempre quis dizer. Dez senhas erradas
 * em 15 minutos vindas do mesmo IP é sinal de ataque; dez entradas certas
 * vindas de uma loja é terça-feira.
 *
 * **Como isto apareceu**: o e2e do projeto passou a fazer 11 logins e o 11º
 * começou a falhar no CI — todos bem-sucedidos, todos do mesmo IP. A suíte
 * estava a um login do teto desde sempre. O sintoma era um teste vermelho; a
 * causa valia para o balcão.
 *
 * `express-rate-limit` considera "bem-sucedido" a resposta com status < 400.
 * O login recusado responde 401, então ele continua contando — que é o caso
 * que a trava existe para conter.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 10, // 10 tentativas FALHAS por IP na janela
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login a partir deste IP. Aguarde 15 minutos e tente novamente.' },
});
