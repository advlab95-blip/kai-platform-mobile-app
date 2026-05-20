import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  I18nManager,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { haptics } from '../utils/haptics';

const { width } = Dimensions.get('window');
const ONBOARDING_KEY = '@onboarding_completed_v1';

type Role = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
};

type Slide = {
  title: string;
  subtitle: string;
  gradient: readonly [string, string, ...string[]];
  roles: Role[];
  hint: string;
};

const slides: Slide[] = [
  {
    title: 'منصة كاي التعليمية',
    subtitle: 'كل أطراف العملية التعليمية بمكان واحد — بسيط، آمن، وعربي بالكامل.',
    gradient: ['#00347D', '#312e81', '#1e1b4b'] as const,
    roles: [
      { icon: 'business', label: 'الإدارة', color: '#00347D' },
      { icon: 'book', label: 'الأستاذ', color: '#10b981' },
      { icon: 'school', label: 'الطالب', color: '#2dd4bf' },
      { icon: 'person', label: 'ولي الأمر', color: '#475569' },
    ],
    hint: 'اسحب لليسار للمتابعة',
  },
  {
    title: 'لكل دور واجهته',
    subtitle: 'الإدارة تنظّم المؤسسة، الأستاذ يدرّس ويقيّم، الطالب يتعلّم ويتابع، وولي الأمر يطمئن دائماً.',
    gradient: ['#10b981', '#059669', '#065f46'] as const,
    roles: [
      { icon: 'cafe', label: 'الكافتيريا', color: '#F97316' },
      { icon: 'medkit', label: 'الطبابة', color: '#EF4444' },
      { icon: 'business', label: 'الإدارة', color: '#00347D' },
      { icon: 'book', label: 'الأستاذ', color: '#10b981' },
    ],
    hint: 'كل واجهة مصمّمة بدقة لمستخدميها',
  },
  {
    title: 'جاهز للبداية؟',
    subtitle: 'اختر دورك من شاشة البوابات، سجّل دخولك، وابدأ تجربة تعليمية متكاملة.',
    gradient: ['#F97316', '#EA580C', '#9A3412'] as const,
    roles: [
      { icon: 'shield-checkmark', label: 'آمن', color: '#10b981' },
      { icon: 'flash', label: 'سريع', color: '#F59E0B' },
      { icon: 'language', label: 'عربي', color: '#3b82f6' },
      { icon: 'lock-closed', label: 'خصوصية', color: '#6366f1' },
    ],
    hint: 'اضغط "ابدأ" لاختيار دورك',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const handleScroll = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const newIndex = Math.round(x / width);
    if (newIndex !== index) {
      setIndex(newIndex);
      haptics.selection();
    }
  };

  const goNext = async () => {
    haptics.light();
    if (index < slides.length - 1) {
      const nextIdx = index + 1;
      // RTL flips horizontal scroll direction; expo-router screens force RTL,
      // but ScrollView still uses raw pixel offsets. Multiply by index regardless.
      scrollRef.current?.scrollTo({ x: nextIdx * width, animated: true });
    } else {
      await finish();
    }
  };

  const goSkip = async () => {
    haptics.light();
    await finish();
  };

  const finish = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      // storage failure is non-fatal — user just sees onboarding next launch
    }
    router.replace('/');
  };

  const current = slides[index];

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={current.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={goSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.skip}>تخطّي</Text>
          </TouchableOpacity>
          <View style={styles.dots}>
            {slides.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === index && styles.dotActive]}
              />
            ))}
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexDirection: I18nManager.isRTL && Platform.OS !== 'web' ? 'row' : 'row' }}
        >
          {slides.map((s, i) => (
            <View key={i} style={[styles.slide, { width }]}>
              <Animated.View
                style={[
                  styles.slideInner,
                  { opacity: fade, transform: [{ translateY: slide }] },
                ]}
              >
                <View style={styles.iconGrid}>
                  {s.roles.map((r, ri) => (
                    <View key={ri} style={styles.iconWrap}>
                      <View style={[styles.iconCircle, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                        <Ionicons name={r.icon} size={28} color="#fff" />
                      </View>
                      <Text style={styles.iconLabel} numberOfLines={1}>
                        {r.label}
                      </Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {s.title}
                </Text>
                <Text style={styles.subtitle} numberOfLines={4}>
                  {s.subtitle}
                </Text>
                <Text style={styles.hint}>{s.hint}</Text>
              </Animated.View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            onPress={goNext}
            activeOpacity={0.85}
            style={styles.cta}
          >
            <View style={styles.ctaInner}>
              <Text style={styles.ctaText}>
                {index === slides.length - 1 ? 'ابدأ' : 'التالي'}
              </Text>
              <Ionicons
                name={index === slides.length - 1 ? 'arrow-forward' : 'chevron-back'}
                size={20}
                color={current.gradient[0]}
                style={{ marginEnd: 8 }}
              />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

export async function shouldShowOnboarding(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(ONBOARDING_KEY);
    return v !== '1';
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#00347D' },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  skip: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '600',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    width: 24,
    backgroundColor: '#fff',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  slideInner: {
    alignItems: 'center',
    width: '100%',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 36,
    maxWidth: 320,
  },
  iconWrap: {
    width: 72,
    alignItems: 'center',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  iconLabel: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: 0.2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  hint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    paddingTop: 8,
  },
  cta: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
});
