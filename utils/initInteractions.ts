import { Alert, AlertButton, AlertOptions, Platform } from 'react-native';
import { haptics } from './haptics';

// Tone detection driven by common copy used across the app (Arabic + English).
// Runs once at startup — avoids touching 50+ files to prefix every Alert.alert call.
type Tone = 'success' | 'error' | 'warning' | 'none';

const SUCCESS_TOKENS = ['تم', 'نجح', 'نجاح', 'حُفظ', 'حفظ', 'أُرسل', 'إرسال', 'success', 'saved', 'sent'];
const ERROR_TOKENS = ['خطأ', 'فشل', 'تعذّر', 'تعذر', 'لم يتم', 'غير صالح', 'error', 'failed', 'invalid'];
const WARNING_TOKENS = ['تحذير', 'تنبيه', 'تأكيد', 'حذف', 'warning', 'confirm', 'delete'];

function detectTone(title?: string, message?: string): Tone {
  const blob = `${title || ''} ${message || ''}`.toLowerCase();
  if (ERROR_TOKENS.some(t => blob.includes(t.toLowerCase()))) return 'error';
  if (SUCCESS_TOKENS.some(t => blob.includes(t.toLowerCase()))) return 'success';
  if (WARNING_TOKENS.some(t => blob.includes(t.toLowerCase()))) return 'warning';
  return 'none';
}

let patched = false;
export function initInteractions() {
  if (patched) return;
  patched = true;

  const originalAlert = Alert.alert.bind(Alert);
  // Replace the static .alert with a tone-aware version that:
  //  • Fires haptics matching the detected tone (success/error/warning).
  //  • On WEB: routes through window.alert / window.confirm because RN's
  //    Alert.alert is a silent no-op on react-native-web. Without this,
  //    every confirmation/success/error popup (725+ call sites) would
  //    fail invisibly — admin can't see deletion errors, teacher can't
  //    confirm exam publishing, etc. Mobile native is unchanged.
  (Alert as any).alert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ) => {
    const tone = detectTone(title, message);
    if (tone === 'success') haptics.success();
    else if (tone === 'error') haptics.error();
    else if (tone === 'warning') haptics.warning();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const body = message ? `${title}\n\n${message}` : title;
      const cancelBtn = buttons?.find((b) => b.style === 'cancel');
      // Treat anything not explicitly cancel as the action button — including
      // the default "OK" affirmation case where no style is set.
      const actionBtn = buttons?.find((b) => b !== cancelBtn);
      if (cancelBtn && actionBtn) {
        // eslint-disable-next-line no-alert
        if (window.confirm(body)) actionBtn.onPress?.(); else cancelBtn.onPress?.();
      } else {
        // eslint-disable-next-line no-alert
        window.alert(body);
        // Fire single-button onPress so callbacks (navigate, refetch, dismiss)
        // still run after the user dismisses. Matches RN native behavior.
        actionBtn?.onPress?.();
      }
      return;
    }
    return originalAlert(title, message, buttons, options);
  };
}

// Utility: wrap a RefreshControl onRefresh callback with a light haptic.
export function withRefreshHaptic<T extends (...args: any[]) => any>(fn: T): T {
  return ((...args: Parameters<T>) => {
    haptics.light();
    return fn(...args);
  }) as T;
}
