import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 10, // Máximo 10 tentativas de login por IP a cada 15 minutos
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login a partir deste IP. Aguarde 15 minutos e tente novamente.' },
});
