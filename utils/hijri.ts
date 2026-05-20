/**
 * Hijri Calendar Utilities for Iraqi educational context
 * Uses Intl.DateTimeFormat with Islamic calendar
 */

/**
 * Format date in Hijri calendar
 * @param date - Date object or ISO string
 * @returns Hijri formatted date string (e.g., "١٥ شوال ١٤٤٧")
 */
export function formatHijri(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return ''; // Fallback if Intl not supported
  }
}

/**
 * Format date with both Gregorian and Hijri
 * @param date - Date object or ISO string
 * @returns "١٥/٤/٢٠٢٦ — ١٥ شوال ١٤٤٧"
 */
export function formatDualDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const gregorian = d.toLocaleDateString('ar-IQ');
  const hijri = formatHijri(d);
  return hijri ? `${gregorian} — ${hijri}` : gregorian;
}

/**
 * Get current Hijri date string
 */
export function getCurrentHijriDate(): string {
  return formatHijri(new Date());
}
