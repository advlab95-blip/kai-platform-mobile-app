// Defensive string coercion — AI may return objects where we expect strings.
// Prevents "Objects are not valid as a React child" crashes in lesson cards.

export function s(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(s).filter(Boolean).join(' — ');
  if (typeof v === 'object') {
    return v.text || v.description || v.label || v.value || v.name || '';
  }
  return '';
}
