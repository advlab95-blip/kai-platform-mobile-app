import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/theme';
import { haptics } from '../../utils/haptics';
import useFeatureFlagsStore from '../../stores/featureFlagsStore';
import SectionLabel from '../../components/institute/SectionLabel';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import KeyboardAwareScroll from '../../components/shared/KeyboardAwareScroll';
import { tokens as dtokens } from '../../constants/designTokens';

// Mirror of OPT_IN_ONLY_FEATURES from hooks/useFeatureFlag.ts — kept in sync so
// optional features stay hidden until admin explicitly enables them.
const OPT_IN_ONLY_FEATURES = new Set<string>([
  'voice_messages', 'medical_records', 'attendance_qr',
  'ai_auto_grading', 'ai_predictive_analysis',
  'leave_requests', 'certificates', 'exam_content_protection',
]);

type GroupKey = 'comm' | 'academic' | 'finance' | 'admin' | 'other';

interface Service {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  bg: string;
  route: string;
  group: GroupKey;
  featureKey?: string;
}

const GROUP_META: Record<GroupKey, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  comm:     { label: 'تواصل',  icon: 'chatbubbles-outline' },
  academic: { label: 'أكاديمي', icon: 'school-outline' },
  finance:  { label: 'المالي',  icon: 'wallet-outline' },
  admin:    { label: 'إدارة',  icon: 'briefcase-outline' },
  other:    { label: 'أخرى',   icon: 'apps-outline' },
};

const GROUP_ORDER: GroupKey[] = ['comm', 'academic', 'finance', 'admin', 'other'];

// Full institute service catalog with group assignments. Grouped here (not
// database-driven) because the design mandates a specific taxonomy that's
// independent of feature flags.
const INSTITUTE_SERVICES: Service[] = [
  // ── تواصل ──
  { icon: 'megaphone',           label: 'الإعلانات',          color: tokens.semantic.orange,  bg: tokens.semantic.orangeBg,  route: '/(institute)/ads',             group: 'comm' },
  { icon: 'chatbubbles',         label: 'الرسائل',            color: tokens.semantic.pink,    bg: tokens.semantic.pinkBg,    route: '/(institute)/chat',            group: 'comm' },
  // Opt-in: only shown when admin enables `leave_requests` for the institute.
  { icon: 'exit-outline',        label: 'طلبات الإجازة',      color: tokens.semantic.warning, bg: tokens.semantic.warningBg, route: '/(institute)/leave-requests',  group: 'comm', featureKey: 'leave_requests' },
  { icon: 'reader-outline',      label: 'قوالب الإعلانات',    color: tokens.semantic.warning, bg: tokens.semantic.warningBg, route: '/(institute)/ann-templates',   group: 'comm' },
  { icon: 'help-buoy-outline',   label: 'الدعم الفني',        color: tokens.semantic.info,    bg: tokens.semantic.infoBg,    route: '/(institute)/help-support',    group: 'comm' },

  // ── أكاديمي ──
  { icon: 'calendar',            label: 'الجدول',             color: tokens.semantic.info,    bg: tokens.semantic.infoBg,    route: '/(institute)/schedule',        group: 'academic' },
  { icon: 'document-text',       label: 'جدول الامتحانات',    color: tokens.semantic.danger,  bg: tokens.semantic.dangerBg,  route: '/(institute)/exam-schedule',   group: 'academic' },
  { icon: 'calendar-outline',    label: 'التقويم الدراسي',    color: tokens.semantic.purple,  bg: tokens.semantic.purpleBg,  route: '/(institute)/academic-calendar', group: 'academic' },
  { icon: 'ribbon',              label: 'الشهادات',           color: tokens.semantic.teal,    bg: tokens.semantic.tealBg,    route: '/(institute)/certificates',    group: 'academic', featureKey: 'certificates' },
  { icon: 'stats-chart',         label: 'التقارير',           color: tokens.semantic.danger,  bg: tokens.semantic.dangerBg,  route: '/(institute)/reports',         group: 'academic' },
  { icon: 'arrow-up-circle',     label: 'الترفيع',            color: tokens.semantic.success, bg: tokens.semantic.successBg, route: '/(institute)/promotion',       group: 'academic' },
  { icon: 'happy-outline',       label: 'الملاحظات السلوكية', color: tokens.semantic.info,    bg: tokens.semantic.infoBg,    route: '/(institute)/behavior-notes',  group: 'academic' },
  { icon: 'book-outline',        label: 'المكتبة',            color: tokens.semantic.purple,  bg: tokens.semantic.purpleBg,  route: '/(institute)/library',         group: 'academic' },

  // ── المالي ──
  { icon: 'wallet',              label: 'المالية',            color: tokens.semantic.success, bg: tokens.semantic.successBg, route: '/(institute)/finance',         group: 'finance' },
  { icon: 'cash',                label: 'الرواتب',            color: tokens.semantic.success, bg: tokens.semantic.successBg, route: '/(institute)/payroll',         group: 'finance' },

  // ── إدارة ──
  // ملاحظة: "المستخدمون" و "الصفوف والشعب" مكررين بشاشة الرئيسية كاختصارات
  // كبيرة، فأُزيلوا من هنا بناءً على طلب المستخدم لتفادي التكرار.
  { icon: 'shield-half-outline', label: 'الأدوار والصلاحيات', color: tokens.semantic.purple,  bg: tokens.semantic.purpleBg,  route: '/(institute)/roles',           group: 'admin' },
  { icon: 'cloud-upload-outline',label: 'استيراد دفعي',       color: tokens.semantic.info,    bg: tokens.semantic.infoBg,    route: '/(institute)/bulk-import',     group: 'admin' },
  { icon: 'shield-checkmark',    label: 'سجل العمليات',       color: tokens.semantic.purple,  bg: tokens.semantic.purpleBg,  route: '/(institute)/audit',           group: 'admin' },
  { icon: 'bus-outline',         label: 'الحافلات',           color: tokens.semantic.orange,  bg: tokens.semantic.orangeBg,  route: '/(institute)/bus-routes',      group: 'admin' },
  { icon: 'settings-outline',    label: 'الإعدادات',          color: tokens.semantic.info,    bg: tokens.semantic.infoBg,    route: '/(institute)/settings',        group: 'admin' },

  // ── أخرى ──
  { icon: 'archive',             label: 'الأرشيف',            color: tokens.semantic.warning, bg: tokens.semantic.warningBg, route: '/(institute)/archive',         group: 'other' },
];

export default function InstituteServices() {
  const router = useRouter();
  const { t } = useTranslation();
  const { myFlags } = useFeatureFlagsStore();
  const [query, setQuery] = useState('');

  // Filter by feature flags (opt-in features hidden unless enabled)
  const visibleServices = useMemo(
    () => INSTITUTE_SERVICES.filter(sv => {
      if (!sv.featureKey) return true;
      const flag = myFlags.find(f => f.feature_key === sv.featureKey);
      const isOptIn = OPT_IN_ONLY_FEATURES.has(sv.featureKey);
      if (!flag) return !isOptIn;
      return flag.is_enabled;
    }),
    [myFlags],
  );

  // Apply search filter to visible services
  const q = query.trim();
  const filtered = useMemo(
    () => q ? visibleServices.filter(sv => sv.label.includes(q)) : visibleServices,
    [q, visibleServices],
  );

  // Partition into groups preserving GROUP_ORDER
  const grouped = useMemo(() => {
    const map = new Map<GroupKey, Service[]>();
    GROUP_ORDER.forEach(g => map.set(g, []));
    filtered.forEach(sv => map.get(sv.group)!.push(sv));
    return map;
  }, [filtered]);

  const totalCount = visibleServices.length;
  const nonEmptyGroups = Array.from(grouped.values()).filter(items => items.length > 0).length;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('common.services')}
        subtitle={`${totalCount} خدمة · ${nonEmptyGroups} مجموعات`}
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        showBack={false}
      />
      <KeyboardAwareScroll
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 12 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={tokens.text[3]} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث عن خدمة..."
            placeholderTextColor={tokens.text[4]}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => { haptics.light(); setQuery(''); }}>
              <Ionicons name="close-circle" size={16} color={tokens.text[3]} />
            </TouchableOpacity>
          )}
        </View>

        {filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="search" size={28} color={tokens.text[4]} />
            <Text style={styles.emptyText}>لا توجد نتائج لـ "{q}"</Text>
          </View>
        ) : (
          <View style={styles.groupsWrap}>
            {GROUP_ORDER.map(gKey => {
              const items = grouped.get(gKey) || [];
              if (items.length === 0) return null;
              const meta = GROUP_META[gKey];
              return (
                <View key={gKey} style={styles.group}>
                  <SectionLabel title={`${meta.label} · ${items.length}`} icon={meta.icon} />
                  <View style={styles.grid}>
                    {items.map((sv, idx) => (
                      <FadeSlideIn key={sv.route} delay={idx * 50} translateFrom={10} style={styles.cardWrap}>
                        <TouchableOpacity
                          style={styles.card}
                          activeOpacity={0.85}
                          onPress={() => {
                            haptics.light();
                            // Use navigate (not push) — these routes are hidden
                            // Tabs.Screen entries (href: null), and expo-router
                            // sometimes fails to re-activate a sibling hidden tab
                            // when you push to it from another. navigate switches
                            // to the target tab reliably even if it's already
                            // mounted in the background.
                            router.navigate(sv.route as any);
                          }}
                        >
                          <View style={[styles.iconWrap, { backgroundColor: sv.bg }]}>
                            <Ionicons name={sv.icon} size={22} color={sv.color} />
                          </View>
                          <Text style={styles.cardLabel} numberOfLines={2}>{sv.label}</Text>
                        </TouchableOpacity>
                      </FadeSlideIn>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.surface.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: tokens.text[1],
    textAlign: 'right',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: tokens.text[3],
    textAlign: 'right',
    marginTop: 4,
    fontWeight: '500',
  },
  searchWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    ...tokens.shadow.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.text[1],
    textAlign: 'right',
    padding: 0,
  },
  groupsWrap: {
    paddingHorizontal: 16,
  },
  group: {
    marginTop: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cardWrap: {
    flexBasis: '31%',
    flexGrow: 1,
  },
  card: {
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 92,
    ...tokens.shadow.xs,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.text[1],
    textAlign: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 13,
    color: tokens.text[3],
    fontWeight: '500',
  },
});
