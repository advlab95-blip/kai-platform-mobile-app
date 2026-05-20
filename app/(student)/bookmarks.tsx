// StudentBookmarks — student's saved content (videos, lessons, exams, etc).
// Generic kind+ref_id pattern so one screen renders heterogeneous saves.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import { timeAgo } from '../../utils/helpers';
import {
  listMyBookmarks, removeBookmark,
  type Bookmark, type BookmarkKind,
} from '../../services/bookmarksService';

const KIND_META: Record<BookmarkKind, { label: string; icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string; routeFor: (refId: string) => string | null }> = {
  video:        { label: 'فيديو',        icon: 'play-circle',      bg: tokens.semantic.dangerBg,  fg: tokens.semantic.danger,
    routeFor: () => '/(student)/content' },
  gallery:      { label: 'صور',          icon: 'images',           bg: tokens.semantic.purpleBg,  fg: tokens.semantic.purple,
    routeFor: () => '/(student)/content' },
  ai_lesson:    { label: 'درس AI',       icon: 'sparkles',         bg: tokens.brand[100],          fg: tokens.brand[500],
    routeFor: () => '/(student)/ai' },
  exam:         { label: 'امتحان',       icon: 'flask',            bg: tokens.semantic.warningBg, fg: tokens.semantic.warning,
    routeFor: () => '/(student)/exams' },
  announcement: { label: 'إعلان',        icon: 'megaphone',        bg: tokens.semantic.infoBg,    fg: tokens.semantic.info,
    routeFor: () => '/(student)/services' },
  material:     { label: 'ملف دراسي',    icon: 'document-text',    bg: tokens.semantic.tealBg,    fg: tokens.semantic.teal,
    routeFor: () => '/(student)/content' },
  assignment:   { label: 'واجب',         icon: 'book',             bg: tokens.semantic.successBg, fg: tokens.semantic.success,
    routeFor: () => '/(student)/assignments' },
};

type Filter = 'all' | BookmarkKind;

export default function StudentBookmarks() {
  const router = useRouter();
  const { userId } = useAuthStore();
  const [items, setItems] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await listMyBookmarks(userId);
      setItems(data);
    } catch (err) {
      if (__DEV__) console.error('[bookmarks] load', err);
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

  const handleRemove = (b: Bookmark) => {
    Alert.alert('حذف من المحفوظات', `حذف "${b.label}"؟`, [
      { text: 'تراجع', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          // Optimistic — remove from list immediately, rollback on error.
          const prev = items;
          setItems((p) => p.filter((x) => x.id !== b.id));
          try {
            await removeBookmark(b.id);
            haptics.success();
          } catch (err: any) {
            setItems(prev);
            haptics.error();
            Alert.alert('خطأ', err?.message || 'فشل الحذف');
          }
        },
      },
    ]);
  };

  const handleOpen = (b: Bookmark) => {
    const meta = KIND_META[b.kind];
    const route = meta?.routeFor(b.ref_id);
    if (!route) {
      Alert.alert('تعذر الفتح', 'هذا النوع لا يدعم الفتح المباشر بعد');
      return;
    }
    haptics.light();
    router.push(route as any);
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((b) => b.kind === filter);
  }, [items, filter]);

  const countsByKind = useMemo(() => {
    const m = new Map<BookmarkKind, number>();
    for (const b of items) m.set(b.kind, (m.get(b.kind) || 0) + 1);
    return m;
  }, [items]);

  const visibleFilters: Filter[] = useMemo(() => {
    // Show "all" + every kind the user has at least one of.
    const ks: Filter[] = ['all'];
    (Object.keys(KIND_META) as BookmarkKind[]).forEach((k) => {
      if (countsByKind.get(k)) ks.push(k);
    });
    return ks;
  }, [countsByKind]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="محفوظاتي"
        subtitle="ما حفظته للعودة إليه"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(236,72,153,0.30)"
        fallbackRoute="/(student)/services"
      />

      {items.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}>
          {visibleFilters.map((f) => {
            const active = filter === f;
            const label = f === 'all' ? `الكل (${items.length})`
              : `${KIND_META[f].label} (${countsByKind.get(f) || 0})`;
            return (
              <TouchableOpacity key={f}
                onPress={() => { haptics.selection(); setFilter(f); }}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.85}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
        }
      >
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SkeletonList count={5} cardHeight={68} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="bookmark-outline" size={36} color={tokens.brand[500]} />
            </View>
            <Text style={styles.emptyTitle}>
              {items.length === 0 ? 'لا توجد محفوظات' : 'لا توجد محفوظات بهذا التصنيف'}
            </Text>
            {items.length === 0 && (
              <Text style={styles.emptyHint}>
                اضغط أيقونة 🔖 على أي محتوى لحفظه هنا
              </Text>
            )}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
            {filtered.map((b, idx) => {
              const meta = KIND_META[b.kind];
              return (
                <FadeSlideIn key={b.id} delay={idx * 25} translateFrom={6}>
                  <TouchableOpacity
                    onPress={() => handleOpen(b)}
                    onLongPress={() => { haptics.medium(); handleRemove(b); }}
                    delayLongPress={350}
                    activeOpacity={0.85}
                    style={styles.row}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
                      <Ionicons name={meta.icon} size={20} color={meta.fg} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label} numberOfLines={2}>{b.label}</Text>
                      <View style={styles.metaRow}>
                        <Text style={[styles.kindLabel, { color: meta.fg }]}>{meta.label}</Text>
                        <Text style={styles.dot}> • </Text>
                        <Text style={styles.timeText}>{timeAgo(b.created_at)}</Text>
                      </View>
                      {b.note ? (
                        <Text style={styles.noteText} numberOfLines={2}>{b.note}</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemove(b)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.removeBtn}
                    >
                      <Ionicons name="close" size={16} color={tokens.text[3]} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                </FadeSlideIn>
              );
            })}
            <Text style={styles.hint}>
              اضغط مطوّلاً للحذف
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  chipsRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row-reverse' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: tokens.surface.surface, borderWidth: 1, borderColor: tokens.border[2] },
  chipActive: { backgroundColor: tokens.brand[500], borderColor: tokens.brand[500] },
  chipText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
  chipTextActive: { color: '#fff' },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    padding: 12,
    ...tokens.shadow.xs,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '800', color: tokens.text[1], textAlign: 'right' },
  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 4 },
  kindLabel: { fontSize: 11, fontWeight: '700' },
  dot: { fontSize: 11, color: tokens.text[4] },
  timeText: { fontSize: 11, color: tokens.text[4] },
  noteText: { fontSize: 11, color: tokens.text[3], textAlign: 'right', marginTop: 4, lineHeight: 16 },
  removeBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: tokens.surface.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  hint: { fontSize: 11, color: tokens.text[4], textAlign: 'center', paddingTop: 8 },

  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 80, gap: 12 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: tokens.brand[100], alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1], textAlign: 'center' },
  emptyHint: { fontSize: 13, color: tokens.text[3], textAlign: 'center' },
});
