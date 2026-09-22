import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  // A suíte E2E autentica cada contexto isolado com o mesmo IP descartável.
  // O limite real continua valendo em desenvolvimento e produção.
  limit: process.env.NODE_ENV === 'test' ? 100 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login a partir deste IP. Aguarde 15 minutos e tente novamente.' },
});
