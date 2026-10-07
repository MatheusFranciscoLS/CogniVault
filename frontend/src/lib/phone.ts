/**
 * Máscara de telefone brasileiro ENQUANTO se digita: `19987654321` vira `(19) 98765-4321`, e fixo de 10 dígitos
 * vira `(19) 3333-4444`. Calcula sempre a partir dos DÍGITOS, então colar com ou sem máscara dá o mesmo resultado.
 * Um `55` na frente (colado de um contato do WhatsApp) é descartado. Mais de 11 dígitos são cortados.
 */
export function maskPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
