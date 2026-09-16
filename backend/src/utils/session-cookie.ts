import type { Request, Response } from 'express';

export const SESSION_COOKIE_NAME = 'cognivault_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

export function readSessionCookie(req: Request): string {
  return parseCookieHeader(req.headers.cookie)[SESSION_COOKIE_NAME] || '';
}

function cookieAttributes(maxAgeSeconds: number): string[] {
  const attributes = [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`,
  ];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  return attributes;
}

export function setSessionCookie(res: Response, token: string): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieAttributes(SESSION_TTL_SECONDS).join('; ')}`,
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; ${cookieAttributes(0).join('; ')}`,
  );
}
