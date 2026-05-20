/**
 * Time-of-day greeting in Arabic. Buckets loosely follow cultural norms in Iraq/gulf —
 * صباح الخير before 12pm, مساء الخير after 6pm, and a neutral "مرحباً" in between.
 *
 * We take `now` as a parameter so tests / storybook can pin the hour; in production
 * callers just invoke `timeGreeting()` and get "now".
 */
export function timeGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'صباح الخير';
  if (h >= 12 && h < 17) return 'مرحباً';
  if (h >= 17 && h < 22) return 'مساء الخير';
  return 'أهلاً بك';                                 // late night / very early morning
}
