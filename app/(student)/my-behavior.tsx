// StudentMyBehavior — student-facing read of behavior notes their teachers
// shared (visible_to_parent=true only). Positive notes get a small celebration
// banner because that's the primary motivator behind exposing this surface.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SectionLabel from '../../components/institute/SectionLabel';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import { timeAgo } from '../../utils/helpers';
import {
  getMyBehaviorNotes, type MyBehaviorNote,
} from '../../services/studentService';

const SENTIMENT_STYLE = {
  positive: { bg: tokens.semantic.successBg, fg: tokens.semantic.success, icon: 'happy-outline', label: 'إيجابية' },
  neutral:  { bg: tokens.surface.surface2,   fg: tokens.text[3],          icon: 'remove-circle-outline', label: 'محايدة' },
  warning:  { bg: tokens.semantic.warningBg, fg: tokens.semantic.warning, icon: 'alert-circle-outline', label: 'تحذير' },
  negative: { bg: tokens.semantic.dangerBg,  fg: tokens.semantic.danger,  icon: 'sad-outline',          label: 'سلبية' },
} as const;

export default function StudentMyBehavior() {
  const { userId } = useAuthStore();
  const [notes, setNotes] = useState<MyBehaviorNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getMyBehaviorNotes(userId);
      setNotes(data);
    } catch (err) {
      if (__DEV__) console.error('[my-behavior] load', err);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const positiveCount = useMemo(
    () => notes.filter((n) => n.sentiment === 'positive').length,
    [notes],
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="ملاحظاتي"
        subtitle="ما يكتبه عنك الأساتذة"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(16,185,129,0.30)"
        fallbackRoute="/(student)/services"
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
        }
      >
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SkeletonList count={5} cardHeight={96} />
          </View>
        ) : notes.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="happy-outline" size={36} color={tokens.brand[500]} />
            </View>
            <Text style={styles.emptyTitle}>لا توجد ملاحظات بعد</Text>
            <Text style={styles.emptyHint}>
              عندما يشاركك أستاذك ملاحظة ستظهر هنا
            </Text>
          </View>
        ) : (
          <View style={{ paddingTop: 8 }}>
            {/* Celebration banner — only when there's at least one positive note */}
            {positiveCount > 0 && (
              <View style={styles.celebrateBox}>
                <Ionicons name="trophy" size={20} color={tokens.semantic.success} />
                <Text style={styles.celebrateText}>
                  {positiveCount === 1
                    ? 'عندك ملاحظة إيجابية واحدة 🎉'
                    : `عندك ${positiveCount} ملاحظات إيجابية 🎉`}
                </Text>
              </View>
            )}

            <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
              <SectionLabel title={`الملاحظات (${notes.length})`} icon="chatbubbles-outline" />
            </View>

            <View style={{ paddingHorizontal: 16, gap: 10 }}>
              {notes.map((n, idx) => {
                const st = SENTIMENT_STYLE[n.sentiment];
                return (
                  <FadeSlideIn key={n.id} delay={idx * 40} translateFrom={10}>
                    <View style={styles.card}>
                      <View style={styles.cardHeader}>
                        <View style={[styles.chip, { backgroundColor: st.bg }]}>
                          <Ionicons name={st.icon as any} size={12} color={st.fg} />
                          <Text style={[styles.chipText, { color: st.fg }]}>{st.label}</Text>
                        </View>
                        <Text style={styles.timeText}>{timeAgo(n.created_at)}</Text>
                      </View>
                      <Text style={styles.noteText}>{n.note}</Text>
                      {n.category ? (
                        <Text style={styles.categoryText}>التصنيف: {n.category}</Text>
                      ) : null}
                    </View>
                  </FadeSlideIn>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  celebrateBox: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.semantic.successBg,
    borderWidth: 1,
    borderColor: tokens.semantic.success + '40',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  celebrateText: { flex: 1, fontSize: 13, fontWeight: '800', color: tokens.semantic.success, textAlign: 'right' },
  card: {
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    padding: 14,
    gap: 8,
    ...tokens.shadow.xs,
  },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 11, fontWeight: '700' },
  timeText: { fontSize: 11, color: tokens.text[4] },
  noteText: { fontSize: 14, color: tokens.text[1], textAlign: 'right', lineHeight: 20 },
  categoryText: { fontSize: 11, color: tokens.text[3], textAlign: 'right' },
  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 80, gap: 12 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: tokens.brand[100], alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1], textAlign: 'center' },
  emptyHint: { fontSize: 13, color: tokens.text[3], textAlign: 'center' },
});
