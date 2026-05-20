import { Alert, Platform } from 'react-native';
import { haptics } from './haptics';

/**
 * Cross-platform confirmation dialog.
 * On mobile: uses Alert.alert with buttons.
 * On web: uses window.confirm (since Alert.alert ignores buttons on web).
 */
export function confirmAlert(
  title: string,
  message: string,
  onConfirm: () => void,
  destructive = false,
  confirmLabel?: string
) {
  if (destructive) haptics.warning(); else haptics.medium();
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) {
      onConfirm();
    }
  } else {
    // For real deletes (student row, exam, …) destructive defaults to 'حذف'
    // + red button. For logout/archive/unlink, pass confirmLabel explicitly
    // (e.g. 'تسجيل الخروج') so users don't read the red button as
    // "delete my account" and cancel out of reflex.
    Alert.alert(title, message, [
      { text: 'إلغاء', style: 'cancel' },
      { text: confirmLabel || (destructive ? 'حذف' : 'تأكيد'), style: destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  }
}

/**
 * Cross-platform success alert with callback.
 * On mobile: Alert.alert with OK button + callback.
 * On web: window.alert + runs callback immediately after.
 */
export function errorAlert(title: string, message: string, onDismiss?: () => void) {
  haptics.error();
  if (Platform.OS === 'web') {
    window.alert(`${title}\n${message}`);
    onDismiss?.();
  } else {
    Alert.alert(title, message, [{ text: 'حسناً', onPress: onDismiss }]);
  }
}

export function successAlert(title: string, message: string, onDismiss?: () => void) {
  haptics.success();
  if (Platform.OS === 'web') {
    window.alert(`${title}\n${message}`);
    onDismiss?.();
  } else {
    Alert.alert(title, message, [{ text: 'حسناً', onPress: onDismiss }]);
  }
}
