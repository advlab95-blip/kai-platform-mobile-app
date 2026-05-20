import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Dimensions, StyleSheet,
  Animated, Easing, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';
import useAuthStore from '../stores/authStore';

const ONBOARDING_KEY = '@onboarding_completed_v1';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 56) / 3; // 3 per row with gaps

// Admin role hidden from UI — accessed via secret gesture on logo
const roles = [
  { id: 'institute', label: 'الإدارة', icon: 'business' as const, gradient: ['#00347D', '#312e81'] as const, iconColor: '#fff' },
  { id: 'teacher', label: 'الأستاذ', icon: 'book' as const, gradient: ['#B9EEAE', '#86efac'] as const, iconColor: '#1E293B' },
  { id: 'student', label: 'الطالب', icon: 'school' as const, gradient: ['#B9EEAE', '#2dd4bf'] as const, iconColor: '#1E293B' },
  { id: 'parent', label: 'ولي الأمر', icon: 'person' as const, gradient: ['#00347D', '#475569'] as const, iconColor: '#fff' },
  { id: 'cafeteria', label: 'الكافتيريا', icon: 'cafe' as const, gradient: ['#F97316', '#F59E0B'] as const, iconColor: '#fff' },
  { id: 'medical', label: 'الطبابة', icon: 'medkit' as const, gradient: ['#EF4444', '#DC2626'] as const, iconColor: '#fff' },
];

// Floating animated icon component
function FloatingIcon({ icon, size, x, y, opacity, duration, delay }: {
  icon: keyof typeof Ionicons.glyphMap; size: number;
  x: number; y: number; opacity: number; duration: number; delay: number;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(translateY, { toValue: -20, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(rotate, { toValue: 8, duration: duration * 1.2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(rotate, { toValue: -8, duration: duration * 1.2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    }, delay);

    return () => clearTimeout(timeout);
  }, []);

  const rotateInterp = rotate.interpolate({
    inputRange: [-8, 8],
    outputRange: ['-8deg', '8deg'],
  });

  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: y }, {
      transform: [{ translateY }, { rotate: rotateInterp }],
    }]}>
      <Ionicons name={icon} size={size} color={`rgba(255,255,255,${opacity})`} />
    </Animated.View>
  );
}

// Glow orb component
function GlowOrb({ color, size, x, y, duration }: {
  color: string; size: number; x: number; y: number; duration: number;
}) {
  const opacityAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, { toValue: 0.7, duration, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0.3, duration, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[{
      opacity: opacityAnim,
      position: 'absolute', left: x, top: y,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
    }]} />
  );
}

// Central orb with glow
function CentralOrb() {
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.4)).current;
  const pingScale = useRef(new Animated.Value(1)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in
    Animated.timing(fadeIn, { toValue: 1, duration: 600, delay: 200, useNativeDriver: true }).start();

    // Scale breathing
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.05, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    // Glow pulsing
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 0.8, duration: 1500, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.4, duration: 1500, useNativeDriver: true }),
      ])
    ).start();

    // Ping particle
    Animated.loop(
      Animated.sequence([
        Animated.timing(pingScale, { toValue: 1.8, duration: 1000, useNativeDriver: true }),
        Animated.timing(pingScale, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const pingOpacity = pingScale.interpolate({
    inputRange: [1, 1.8],
    outputRange: [1, 0.2],
  });

  return (
    <Animated.View style={[{ alignItems: 'center', marginBottom: 20, marginTop: 20, opacity: fadeIn }]}>
      <Animated.View style={[{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }]}>
        {/* Glow behind */}
        <Animated.View style={[{
          opacity: glowOpacity,
          position: 'absolute', width: 90, height: 90, borderRadius: 45,
          backgroundColor: 'rgba(0,212,255,0.3)',
        }]} />
        {/* Orb */}
        <View style={s.orb}>
          <Ionicons name="school" size={38} color="#fff" />
        </View>
        {/* Particles */}
        <Animated.View style={[{
          position: 'absolute', top: -2, right: -2,
          width: 12, height: 12, borderRadius: 6,
          backgroundColor: '#B9EEAE',
          transform: [{ scale: pingScale }],
          opacity: pingOpacity,
        }]} />
        <View style={{
          position: 'absolute', bottom: 8, left: -4,
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: '#00D4FF',
        }} />
      </Animated.View>
    </Animated.View>
  );
}

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

// Simple fade-in wrapper to replace FadeIn entering animation
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

export default function GateScreen() {
  const router = useRouter();
  const { role, isInitialized, login } = useAuthStore();

  // Secret admin access: long press on version text (5 seconds)
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');

  const handleVersionLongPress = () => {
    setShowAdminLogin(true);
    setAdminCode('');
    setAdminError('');
  };

  const handleAdminLogin = async () => {
    if (adminCode.length < 4) { setAdminError('الرمز قصير جداً'); return; }
    setAdminLoading(true);
    setAdminError('');
    try {
      const success = await login(adminCode, 'admin');
      if (success) {
        setShowAdminLogin(false);
      } else {
        setAdminError('الرمز غير صحيح');
      }
    } catch (err: any) {
      setAdminError(err.message || 'فشل تسجيل الدخول');
    }
    setAdminLoading(false);
  };

  useEffect(() => {
    if (isInitialized && role) {
      // Small delay to ensure Root Layout is fully mounted before navigating
      const timer = setTimeout(() => {
        router.replace(`/(${role})` as any);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isInitialized, role]);

  // First-launch onboarding: only redirect when there's no auth session.
  // AsyncStorage failure → assume completed (don't trap users in a loop).
  useEffect(() => {
    if (!isInitialized || role) return;
    let cancelled = false;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (!cancelled && v !== '1') {
          router.replace('/onboarding' as any);
        }
      } catch {
        // ignore — user just sees gate normally
      }
    })();
    return () => { cancelled = true; };
  }, [isInitialized, role]);

  // Show minimal screen while redirecting (prevents gradient flash)
  if (isInitialized && role) {
    return <View style={{ flex: 1, backgroundColor: '#020024' }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#020024' }}>
      <LinearGradient
        colors={['#020024', '#2F2FBA', '#00D4FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>

          {/* ===== Animated Header ===== */}
          <View style={s.header}>
            {/* Glow orbs */}
            <GlowOrb color="rgba(0,212,255,0.3)" size={200} x={-40} y={-40} duration={4000} />
            <GlowOrb color="rgba(185,238,174,0.2)" size={160} x={width - 80} y={80} duration={6000} />

            {/* Floating background icons */}
            <FloatingIcon icon="book" size={90} x={width - 80} y={20} opacity={0.08} duration={8000} delay={0} />
            <FloatingIcon icon="globe" size={120} x={-20} y={60} opacity={0.08} duration={7000} delay={500} />

            {/* Floating middle layer icons */}
            <FloatingIcon icon="bulb" size={45} x={width - 100} y={80} opacity={0.3} duration={6000} delay={200} />
            <FloatingIcon icon="sparkles" size={35} x={40} y={30} opacity={0.3} duration={4000} delay={400} />
            <FloatingIcon icon="school" size={50} x={width - 130} y={140} opacity={0.15} duration={8000} delay={1000} />

            {/* Central Orb */}
            <CentralOrb />

            {/* Title — Arabic title with a small sparkle accent. The sparkle sits
                ABOVE the title so the title itself stays perfectly centered on the
                screen (previously the inline sparkle nudged the whole row right). */}
            <FadeInUpView delay={300} duration={600} style={{ alignItems: 'center' }}>
              <View style={{ alignItems: 'center' }}>
                <Ionicons
                  name="sparkles"
                  size={14}
                  color="#B9EEAE"
                  style={{ marginBottom: 2, opacity: 0.9 }}
                />
                <Text style={[s.title, { textAlign: 'center' }]}>منصة كاي</Text>
                <Text style={[s.subtitle, { textAlign: 'center' }]}>KAI PLATFORM</Text>
              </View>
            </FadeInUpView>

            {/* Divider line */}
            <View style={s.divider} />

            <FadeInUpView delay={500} duration={600}>
              <Text style={s.tagline}>
                مستقبل التعليم، يبدأ من هنا.
              </Text>
            </FadeInUpView>
          </View>

          {/* ===== Role Selection ===== */}
          <View style={s.rolesSection}>
            <Text style={s.rolesLabel}>الرجاء اختيار بوابة الدخول</Text>

            <View style={s.rolesGrid}>
              {roles.map((role, index) => (
                <FadeInUpView
                  key={role.id}
                  delay={100 + index * 80}
                  duration={500}
                >
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => router.push({ pathname: '/login', params: { role: role.id } })}
                    style={s.roleCard}
                  >
                    <LinearGradient
                      colors={[...role.gradient]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.roleIconBox}
                    >
                      <Ionicons name={role.icon} size={20} color={role.iconColor} />
                    </LinearGradient>
                    <Text style={s.roleLabel}>{role.label}</Text>
                  </TouchableOpacity>
                </FadeInUpView>
              ))}
            </View>
          </View>

          {/* Footer — long press 5s to open admin login */}
          <FadeInView delay={800} style={s.footer}>
            <TouchableOpacity activeOpacity={0.7} onLongPress={handleVersionLongPress} delayLongPress={5000}>
              <Text style={s.footerText}>KAI PLATFORM v1.0.0</Text>
            </TouchableOpacity>
          </FadeInView>

        </ScrollView>
      </SafeAreaView>

      {/* Secret Admin Login Modal */}
      <Modal visible={showAdminLogin} transparent animationType="fade">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', padding: 24 }}>
            <View style={{ backgroundColor: '#1E293B', borderRadius: 24, padding: 28, width: '100%', maxWidth: 340, alignItems: 'center', borderWidth: 1, borderColor: '#334155' }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Ionicons name="shield-checkmark" size={28} color="#fff" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff', marginBottom: 4 }}>دخول Admin</Text>
              <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 20 }}>أدخل الرمز السري</Text>

              <TextInput
                style={{ width: '100%', backgroundColor: '#0F172A', borderRadius: 14, borderWidth: 1, borderColor: adminError ? '#EF4444' : '#334155', paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: 3 }}
                value={adminCode}
                onChangeText={(t) => { setAdminCode(t.toUpperCase()); setAdminError(''); }}
                placeholder="● ● ● ●"
                placeholderTextColor="#475569"
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                maxLength={20}
                secureTextEntry
                onSubmitEditing={handleAdminLogin}
                returnKeyType="go"
              />

              {adminError ? <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700', marginTop: 8 }}>{adminError}</Text> : null}

              <TouchableOpacity
                style={{ width: '100%', backgroundColor: '#4F46E5', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16, opacity: adminLoading ? 0.6 : 1 }}
                onPress={handleAdminLogin}
                disabled={adminLoading}
              >
                {adminLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>تسجيل الدخول</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setShowAdminLogin(false)} style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 13, color: '#64748B' }}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
  },
  orb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 6,
    marginTop: 4,
    textAlign: 'center',
  },
  divider: {
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginTop: 16,
  },
  tagline: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
    marginTop: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  rolesSection: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 16,
  },
  rolesLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  rolesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  roleCard: {
    width: CARD_WIDTH,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.8)',
  },
  roleIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  roleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 15,
  },

  footer: {
    alignItems: 'center',
    paddingBottom: 24,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 1,
  },
});
