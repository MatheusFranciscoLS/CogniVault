const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://cognivault-murex.vercel.app',
  'https://cognivault-matheus-projects-50653618.vercel.app',
  'https://cognivault-git-main-matheus-projects-50653618.vercel.app',
] as const;

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/$/, '');
}

export function allowedCorsOrigins(configuredOrigins = process.env.CORS_ORIGINS || ''): Set<string> {
  const configured = configuredOrigins
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

export function isAllowedCorsOrigin(origin: string, allowedOrigins = allowedCorsOrigins()): boolean {
  return allowedOrigins.has(normalizeOrigin(origin));
}
