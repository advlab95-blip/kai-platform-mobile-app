import { Alert, Platform } from 'react-native';

/**
 * Cross-platform clipboard copy without requiring expo-clipboard (not yet in deps).
 *
 * On web: uses `navigator.clipboard.writeText` (all modern browsers).
 * On native: dynamically imports expo-clipboard IF present, else falls back to
 * an Alert.prompt-style display the user can copy from manually.
 *
 * Returns true when the write succeeded, false otherwise. Silent on success —
 * callers should show their own "تم النسخ" toast/alert.
 */
export async function copyToClipboard(text: string, label?: string): Promise<boolean> {
  if (!text) return false;

  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      // Legacy fallback — execCommand is deprecated but still works everywhere.
      if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
        return true;
      }
    } catch { /* fall through */ }
    return false;
  }

  // Native: try expo-clipboard at runtime (optional dependency — no build break if absent).
  try {
    const mod: any = await import('expo-clipboard' as any);
    const setStringAsync = mod?.setStringAsync || mod?.default?.setStringAsync;
    if (typeof setStringAsync === 'function') {
      await setStringAsync(text);
      return true;
    }
  } catch { /* library not installed */ }

  // Final fallback — surface the value so the user can long-press to copy.
  Alert.alert(label || 'انسخ يدوياً', text);
  return false;
}
