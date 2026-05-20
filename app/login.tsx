import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet,
  Animated, Easing,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import useAuthStore from '../stores/authStore';
import type { RoleId } from '../types';
import { useTranslation } from 'react-i18next';
import { haptics } from '../utils/haptics';
import { sounds } from '../utils/sounds';

const roleConfig: Record<string, {
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradient: readonly [string, string];
  iconColor: string;
  shadow: string;
}> = {
  admin:      { labelKey: 'roles.admin', icon: 'shield-checkmark', gradient: ['#00347D', '#1e40af'], iconColor: '#fff', shadow: '#1e40af' },
  institute:  { labelKey: 'roles.institute',  icon: 'business',         gradient: ['#00347D', '#312e81'], iconColor: '#fff', shadow: '#312e81' },
  teacher:    { labelKey: 'roles.teacher',    icon: 'book',             gradient: ['#B9EEAE', '#86efac'], iconColor: '#1E293B', shadow: '#86efac' },
  student:    { labelKey: 'roles.student',    icon: 'school',           gradient: ['#B9EEAE', '#2dd4bf'], iconColor: '#1E293B', shadow: '#2dd4bf' },
  parent:     { labelKey: 'roles.parent',     icon: 'person',           gradient: ['#00347D', '#475569'], iconColor: '#fff', shadow: '#475569' },
  cafeteria:  { labelKey: 'roles.cafeteria',  icon: 'cafe',             gradient: ['#F97316', '#F59E0B'], iconColor: '#fff', shadow: '#F97316' },
  medical:    { labelKey: 'roles.medical',    icon: 'medkit',           gradient: ['#EF4444', '#DC2626'], iconColor: '#fff', shadow: '#EF4444' },
};

// Fade-in-up wrapper to replace FadeInUp entering animation
function FadeInUpView({ delay = 0, duration = 600, style, children }: {
  delay?: number; duration?: number; style?: any; children: React.ReactNode;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

// Simple fade-in wrapper
function FadeInView({ delay = 0, duration = 400, style, children }: {
  delay?: number; duration?: number; style?: any; children: React.ReactNode;
}) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration, delay, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[style, { opacity }]}>
      {children}
    </Animated.View>
  );
}

// Polished login CTA with scale-on-press, multi-stop gradient, glow ring,
// shimmer sweep, and an integrated lock icon on the right (RTL).
function LoginButton({
  onPress,
  disabled,
  isLoading,
  label,
  accentColor,
}: {
  onPress: () => void;
  disabled: boolean;
  isLoading: boolean;
  label: string;
  accentColor: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (disabled) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, [disabled]);

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 220],
  });

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, friction: 6 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
  };

  return (
    <Animated.View style={{ marginTop: 18, width: '100%', transform: [{ scale }] }}>
      {/* Outer glow ring */}
      <View style={[s.loginGlow, { shadowColor: accentColor || '#2F2FBA' }, disabled ? { shadowOpacity: 0 } : null]} />
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        activeOpacity={0.92}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, busy: isLoading }}
      >
        <LinearGradient
          colors={disabled ? ['#475569', '#334155'] : ['#3B3BCC', '#2F2FBA', '#020024']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.loginBtn, disabled ? { opacity: 0.55 } : null]}
        >
          {/* Inner top highlight for glassy depth */}
          <LinearGradient
            colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={s.loginInnerHighlight}
            pointerEvents="none"
          />
          {/* Shimmer sweep */}
          {!disabled && !isLoading ? (
            <Animated.View
              pointerEvents="none"
              style={[
                s.loginShimmer,
                { transform: [{ translateX: shimmerTranslate }, { rotate: '18deg' }] },
              ]}
            />
          ) : null}

          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={s.loginContent}>
              <View style={s.loginIconCircle}>
                <Ionicons name="lock-closed" size={14} color="#fff" />
              </View>
              <Text style={s.loginBtnText}>{label}</Text>
              <Ionicons name="arrow-back" size={18} color="rgba(255,255,255,0.95)" />
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const { role } = useLocalSearchParams<{ role: string }>();
  const router = useRouter();
  const { login, isLoading, authError, setAuthError } = useAuthStore();
  const [code, setCode] = useState('');
  const inputRef = useRef<TextInput>(null);

  const config = roleConfig[role || 'admin'];

  // Icon float animation
  const iconY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(iconY, { toValue: -8, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(iconY, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleLogin = async () => {
    haptics.light();
    if (!code.trim()) {
      haptics.error();
      setAuthError(t('auth.enterCode'));
      return;
    }
    if (code.trim().length < 6) {
      haptics.error();
      setAuthError(t('auth.codeTooShort'));
      return;
    }
    const success = await login(code, role as RoleId);
    if (success) {
      haptics.success();
      sounds.play('success');
      // Offer biometric enrollment via explicit consent prompt — App Store + privacy
      // require opt-in, never silent. Ask once per device; after answer, skip.
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const { BiometricService } = await import('../services/biometricAuth');
        const available = await BiometricService.isAvailable();
        const alreadyEnabled = await BiometricService.isEnabled();
        const alreadyPrompted = await AsyncStorage.getItem('@biometric_prompted');
        if (available && !alreadyEnabled && !alreadyPrompted) {
          const supportedType = await BiometricService.getSupportedType();
          const featureName =
            supportedType === 'face'
              ? t('login.faceId', { defaultValue: 'Face ID' })
              : t('login.fingerprint', { defaultValue: 'البصمة' });
          Alert.alert(
            t('login.enableBiometricTitle', { defaultValue: 'تفعيل دخول سريع؟' }),
            t('login.enableBiometricMsg', {
              defaultValue: `هل تريد استخدام ${featureName} لتسجيل الدخول مرة قادمة بدون كتابة الرمز؟`,
              feature: featureName,
            }),
            [
              {
                text: t('common.notNow', { defaultValue: 'ليس الآن' }),
                style: 'cancel',
                onPress: () => { AsyncStorage.setItem('@biometric_prompted', 'true').catch(() => {}); },
              },
              {
                text: t('common.enable', { defaultValue: 'تفعيل' }),
                onPress: async () => {
                  try {
                    await BiometricService.enable(code, role as string);
                    await AsyncStorage.setItem('@biometric_prompted', 'true');
                  } catch { /* silent */ }
                },
              },
            ],
            { cancelable: false },
          );
        }
      } catch { /* silent */ }
      router.replace(`/(${role})` as any);
    } else {
      haptics.error();
      sounds.play('error');
    }
  };

  // Quick biometric sign-in if user previously enabled it
  const handleBiometricLogin = async () => {
    try {
      const { BiometricService } = await import('../services/biometricAuth');
      const enabled = await BiometricService.isEnabled();
      if (!enabled) {
        Alert.alert(
          t('common.warning', { defaultValue: 'تنبيه' }),
          t('login.biometricNotEnrolled', { defaultValue: 'سجّل دخولك بالرمز أولاً لتفعيل البصمة' })
        );
        return;
      }
      const ok = await BiometricService.authenticate(t('login.unlockWithBiometric', { defaultValue: 'افتح بالبصمة' }));
      if (!ok) return;
      const creds = await BiometricService.getSavedCredentials();
      if (!creds) {
        Alert.alert(t('common.error'), 'لم نعثر على بيانات البصمة');
        return;
      }
      const success = await login(creds.code, creds.role as RoleId);
      if (success) router.replace(`/(${creds.role})` as any);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل التحقق بالبصمة');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={['#020024', '#2F2FBA']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {/* Back Button */}
          <FadeInView delay={100}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={s.backBtn}
              activeOpacity={0.7}
              accessibilityLabel="العودة"
              accessibilityRole="button"
            >
              <Ionicons name="arrow-forward" size={22} color="#fff" />
            </TouchableOpacity>
          </FadeInView>

          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>

            {/* Login Card — matches web exactly */}
            <FadeInUpView delay={200} duration={600} style={s.card}>

              {/* Role Icon */}
              <Animated.View style={[{ alignItems: 'center', marginBottom: 24, transform: [{ translateY: iconY }] }]}>
                <LinearGradient
                  colors={[...config.gradient]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[s.iconBox, { shadowColor: config.shadow }]}
                >
                  <Ionicons name={config.icon} size={36} color={config.iconColor} />
                </LinearGradient>
              </Animated.View>

              {/* Title */}
              <Text style={s.title}>{t('auth.loginTitle')} {t(config.labelKey)}</Text>
              <Text style={s.description}>{t('auth.codeDescription')}</Text>

              {/* Code Input */}
              <View style={{ marginTop: 24 }}>
                <TextInput
                  ref={inputRef}
                  value={code}
                  onChangeText={(t) => { setCode(t.toUpperCase()); setAuthError(''); }}
                  placeholder={t('auth.enterYourCode')}
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoFocus
                  maxLength={20}
                  style={[s.input, authError ? s.inputError : null]}
                  onSubmitEditing={handleLogin}
                  returnKeyType="go"
                />

                {/* Error */}
                {authError ? (
                  <FadeInUpView duration={300} style={s.errorBox}>
                    <Ionicons name="alert-circle" size={14} color={Colors.error} />
                    <Text style={s.errorText}>{authError}</Text>
                  </FadeInUpView>
                ) : null}
              </View>

              {/* Login Button */}
              <LoginButton
                onPress={handleLogin}
                disabled={isLoading || !code.trim()}
                isLoading={isLoading}
                label={t('auth.secureLogin')}
                accentColor={config.shadow}
              />

              {/* Biometric quick sign-in (only shows on native with enrolled biometric) */}
              {Platform.OS !== 'web' && (
                <TouchableOpacity
                  onPress={handleBiometricLogin}
                  style={{ marginTop: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 10 }}
                  activeOpacity={0.6}
                >
                  <Ionicons name="finger-print" size={18} color={Colors.primary} />
                  <Text style={[s.backLink, { color: Colors.primary, fontWeight: '800' }]}>
                    {t('login.biometricLogin', { defaultValue: 'الدخول بالبصمة' })}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Back link */}
              <TouchableOpacity
                onPress={() => { router.back(); }}
                style={{ marginTop: 16, alignItems: 'center' }}
                activeOpacity={0.6}
              >
                <Text style={s.backLink}>{t('common.backToGates')}</Text>
              </TouchableOpacity>
            </FadeInUpView>

          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  backBtn: {
    position: 'absolute',
    top: 12,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    alignItems: 'center',
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 34,
  },
  description: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 24,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
    letterSpacing: 6,
    width: '100%',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    justifyContent: 'center',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  loginGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 4,
    bottom: -4,
    borderRadius: 22,
    backgroundColor: 'transparent',
    shadowColor: '#2F2FBA',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 12,
  },
  loginBtn: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  loginInnerHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '55%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  loginShimmer: {
    position: 'absolute',
    top: -30,
    bottom: -30,
    width: 70,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  loginContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
  },
  loginIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.6,
    flex: 1,
    textAlign: 'center',
  },
  backLink: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
});
