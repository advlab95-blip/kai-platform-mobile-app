/**
 * Validate Iraqi phone number format
 * Accepts: 07XX XXX XXXX, +964 7XX XXX XXXX, 07XXXXXXXXX
 */
export function validateIraqiPhone(phone: string): boolean {
  if (!phone || !phone.trim()) return true; // Optional field — empty is OK
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^(\+964|0)7\d{8,9}$/.test(cleaned);
}

/**
 * Format phone number for display
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+964')) {
    const local = cleaned.slice(4);
    return `+964 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  if (cleaned.startsWith('0')) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
}
