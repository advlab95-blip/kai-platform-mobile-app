// Strong random 8-character codes for bulk user creation.
// CHARS excludes I / O / 0 / 1 to avoid confusion when printing/typing codes.
// crypto.getRandomValues is available in React Native via expo-crypto polyfill.

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export function generateSecureCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  const g: any = globalThis as any;
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < CODE_LENGTH; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CHARS[bytes[i] % CHARS.length];
  return out;
}

/**
 * Generate N unique codes that don't collide with any existingCodes.
 * Throws if collision budget is exhausted — caller should surface to UI.
 */
export async function generateUniqueCodes(
  count: number,
  existingCodes: string[] = [],
): Promise<string[]> {
  const used = new Set(existingCodes.map(c => (c || '').toUpperCase()));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let code = '';
    let tries = 0;
    do {
      code = generateSecureCode();
      tries++;
      if (tries > 1000) throw new Error('تعذّر توليد كود فريد — حاول مرة أخرى');
    } while (used.has(code));
    used.add(code);
    out.push(code);
  }
  return out;
}
