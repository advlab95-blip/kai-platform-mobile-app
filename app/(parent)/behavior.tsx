// ParentChildBehavior — read-only view of behavior notes the teacher chose to
// share (visible_to_parent=true) for the parent's selected child.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useParentStore from '../../stores/parentStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import ChildSwitcher from '../../components/shared/ChildSwitcher';
import SectionLabel from '../../components/institute/SectionLabel';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import { timeAgo } from '../../utils/helpers';
import {
  getChildBehaviorNotes, type ChildBehaviorNote,
} from '../../services/parentService';

const SENTIMENT_STYLE = {
  positive: { bg: tokens.semantic.successBg, fg: tokens.semantic.success, icon: 'happy-outline', label: 'إيجابية' },
  neutral:  { bg: tokens.surface.surface2,   fg: tokens.text[3],          icon: 'remove-circle-outline', label: 'محايدة' },
  warning:  { bg: tokens.semantic.warningBg, fg: tokens.semantic.warning, icon: 'alert-circle-outline', label: 'تحذير' },
  negative: { bg: tokens.semantic.dangerBg,  fg: tokens.semantic.danger,  icon: 'sad-outline',          label: 'سلبية' },
} as const;

export default function ParentChildBehavior() {
  const { selectedChildId, children } = useParentStore();
  const [notes, setNotes] = useState<ChildBehaviorNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const selectedChild = children.find((c) => c.id === selectedChildId);

  const load = useCallback(async () => {
    if (!selectedChildId) { setNotes([]); return; }
    setLoading(true);
    try {
      const data = await getChildBehaviorNotes(selectedChildId);
      setNotes(data);
    } catch (err) {
      if (__DEV__) console.error('[parent/behavior] load', err);
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => { load(); }, [load]);

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
        title="ملاحظات سلوكية"
        subtitle={selectedChild ? selectedChild.name : 'اختر طفلاً'}
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(16,185,129,0.30)"
        fallbackRoute="/(parent)/services"
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
        }
      >
        <ChildSwitcher />

        {!selectedChildId ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyHint}>اختر طفلاً لعرض ملاحظاته</Text>
          </View>
        ) : loading ? (
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
              عند مشاركة الأستاذ ملاحظة عن {selectedChild?.name || 'طفلك'} ستظهر هنا
            </Text>
          </View>
        ) : (
          <View style={{ paddingTop: 8 }}>
            {positiveCount > 0 && (
              <View style={styles.celebrateBox}>
                <Ionicons name="trophy" size={20} color={tokens.semantic.success} />
                <Text style={styles.celebrateText}>
                  {`${selectedChild?.name || 'طفلك'} حصل على ${positiveCount} ${positiveCount === 1 ? 'ملاحظة إيجابية' : 'ملاحظات إيجابية'} 🎉`}
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
    marginHorizontal: 16, marginBottom: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.semantic.successBg,
    borderWidth: 1, borderColor: tokens.semantic.success + '40',
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
  },
  celebrateText: { flex: 1, fontSize: 13, fontWeight: '800', color: tokens.semantic.success, textAlign: 'right' },
  card: {
    backgroundColor: tokens.surface.surface, borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.border[2], padding: 14, gap: 8,
    ...tokens.shadow.xs,
  },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 11, fontWeight: '700' },
  timeText: { fontSize: 11, color: tokens.text[4] },
  noteText: { fontSize: 14, color: tokens.text[1], textAlign: 'right', lineHeight: 20 },
  categoryText: { fontSize: 11, color: tokens.text[3], textAlign: 'right' },
  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, gap: 12 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: tokens.brand[100], alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1], textAlign: 'center' },
  emptyHint: { fontSize: 13, color: tokens.text[3], textAlign: 'center' },
});
