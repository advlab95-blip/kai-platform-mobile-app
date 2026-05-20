/**
 * Biometric Authentication Service
 * Supports: Face ID, Touch ID, Fingerprint
 * Optional — user enables/disables from settings
 */
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const BIOMETRIC_ENABLED_KEY = '@biometric_enabled';
const BIOMETRIC_CODE_KEY = 'kai-biometric-code';
const BIOMETRIC_ROLE_KEY = 'kai-biometric-role';

export const BiometricService = {
  async isAvailable(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      return hasHardware && isEnrolled;
    } catch { return false; }
  },

  async getSupportedType(): Promise<'face' | 'fingerprint' | 'none'> {
    try {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
      if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
    } catch {}
    return 'none';
  },

  async authenticate(reason?: string): Promise<boolean> {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason || 'تسجيل الدخول بالبصمة',
        fallbackLabel: 'استخدم الرمز',
        cancelLabel: 'إلغاء',
        // Disable OS-level device passcode fallback — a thief who knows the
        // device PIN should not be able to bypass biometric and enter the
        // account (which may include financial data for institute admins).
        disableDeviceFallback: true,
      });
      return result.success;
    } catch { return false; }
  },

  async isEnabled(): Promise<boolean> {
    try {
      const val = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
      return val === 'true';
    } catch { return false; }
  },

  async enable(code: string, role: string) {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(BIOMETRIC_CODE_KEY, code);
    await SecureStore.setItemAsync(BIOMETRIC_ROLE_KEY, role);
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
  },

  async disable() {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'false');
    try {
      await SecureStore.deleteItemAsync(BIOMETRIC_CODE_KEY);
      await SecureStore.deleteItemAsync(BIOMETRIC_ROLE_KEY);
    } catch {}
  },

  async getSavedCredentials(): Promise<{ code: string; role: string } | null> {
    try {
      const code = await SecureStore.getItemAsync(BIOMETRIC_CODE_KEY);
      const role = await SecureStore.getItemAsync(BIOMETRIC_ROLE_KEY);
      if (code && role) return { code, role };
    } catch {}
    return null;
  },
};
