import { normalizeIdentifier } from '../utils/normalize';

export const MAX_VERIFICATION_CODE_LENGTH = 80;
export const MAX_VERIFICATION_BATCH_CODES = 80;

export function parseVerificationCodesQuery(value: unknown): string[] | null {
  if (value === undefined || value === null || value === '') return [];
  if (typeof value !== 'string') return null;
  if (value.length > MAX_VERIFICATION_BATCH_CODES * (MAX_VERIFICATION_CODE_LENGTH + 1)) return null;

  const codes = value
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);

  if (codes.length > MAX_VERIFICATION_BATCH_CODES) return null;
  if (codes.some((code) => code.length > MAX_VERIFICATION_CODE_LENGTH || !normalizeIdentifier(code))) return null;
  return [...new Set(codes)];
}

export function parseRequiredVerificationCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim();
  if (!code || code.length > MAX_VERIFICATION_CODE_LENGTH || !normalizeIdentifier(code)) return null;
  return code;
}

export function parseOptionalVerificationText(
  value: unknown,
  maxLength: number,
): { valid: boolean; value: string | null } {
  if (value === undefined || value === null || value === '') return { valid: true, value: null };
  if (typeof value !== 'string') return { valid: false, value: null };
  const text = value.trim();
  if (!text) return { valid: true, value: null };
  if (text.length > maxLength) return { valid: false, value: null };
  return { valid: true, value: text };
}
