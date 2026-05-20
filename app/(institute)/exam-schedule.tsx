// شاشة الإدارة — قائمة جداول الامتحانات الشهرية (الورقية).
// مفصولة عن exams (الكوزات اللي يسوّيها الأستاذ بالتطبيق).
//
// السلوك:
// - الإدارة تشوف drafts + published لمؤسستها فقط (RLS يحرس).
// - زر FAB يفتح builder لإنشاء جدول جديد.
// - الضغط على بطاقة جدول يفتح builder للتعديل/النشر.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import {
  getExamSchedules,
  deleteExamSchedule,
  type ExamSchedule,
} from '../../services/examScheduleService';
import { confirmAlert } from '../../utils/alerts';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('ar-IQ', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return '—';
  }
}

function statusMeta(status: ExamSchedule['status']) {
  switch (status) {
    case 'published':
      return { label: 'منشور', color: tokens.semantic.success, bg: tokens.semantic.successBg, icon: 'checkmark-circle' as const };
    case 'cancelled':
      return { label: 'ملغي', color: tokens.semantic.danger, bg: tokens.semantic.dangerBg, icon: 'close-circle' as const };
    default:
      return { label: 'مسودة', color: tokens.semantic.warning, bg: tokens.semantic.warningBg, icon: 'document-outline' as const };
  }
}

export default function InstituteExamSchedule() {
  const router = useRouter();
  const { userInstituteId } = useDataStore();
  const { userId } = useAuthStore();

  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const list = await getExamSchedules(userInstituteId);
      setSchedules(list);
    } catch (err: any) {
      console.error('load exam schedules', err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل الجداول');
    } finally {
      setLoading(false);
    }
  }, [userInstituteId]);

  useEffect(() => { load(); }, [load]);

  // إعادة تحميل عند العودة للشاشة (بعد إنشاء/تعديل/نشر من الـ builder)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const openNew = () => {
    if (!userInstituteId || !userId) return;
    haptics.light();
    router.push({ pathname: '/(institute)/exam-schedule-builder', params: { mode: 'new' } } as any);
  };

  const openEdit = (s: ExamSchedule) => {
    haptics.light();
    router.push({ pathname: '/(institute)/exam-schedule-builder', params: { id: s.id } } as any);
  };

  const handleDelete = (s: ExamSchedule) => {
    confirmAlert(
      'حذف الجدول',
      `حذف "${s.name}"؟ سيتم حذف جميع البنود ولا يمكن التراجع.`,
      async () => {
        try {
          await deleteExamSchedule(s.id);
          setSchedules((prev) => prev.filter((x) => x.id !== s.id));
        } catch (err: any) {
          Alert.alert('خطأ', err.message || 'فشل الحذف');
        }
      },
      true
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="جدول الامتحانات"
        subtitle="إنشاء ونشر جداول الامتحانات الشهرية"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      {loading ? (
        <ActivityIndicator color={tokens.brand[500]} style={{ marginTop: 60 }} />
      ) : schedules.length === 0 ? (
        <View style={styles.emptyBox}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="calendar-outline" size={36} color={tokens.brand[500]} />
          </View>
          <Text style={styles.emptyTitle}>لا توجد جداول</Text>
          <Text style={styles.emptyHint}>اضغط "+" لإنشاء جدول امتحانات جديد</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
          }
          showsVerticalScrollIndicator={false}
        >
          {schedules.map((s, idx) => {
            const st = statusMeta(s.status);
            return (
              <FadeSlideIn key={s.id} delay={Math.min(idx * 40, 400)} translateFrom={10}>
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.85}
                  onPress={() => openEdit(s)}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
                      <Ionicons name={st.icon} size={11} color={st.color} />
                      <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                    </View>
                    <Text style={styles.title} numberOfLines={1}>{s.name}</Text>
                  </View>
                  {!!s.description && (
                    <Text style={styles.body} numberOfLines={2}>{s.description}</Text>
                  )}
                  <View style={styles.meta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="calendar-outline" size={12} color={tokens.text[4]} />
                      <Text style={styles.metaText}>
                        {fmtDate(s.period_start)} → {fmtDate(s.period_end)}
                      </Text>
                    </View>
                    {s.published_at && (
                      <View style={styles.metaItem}>
                        <Ionicons name="cloud-upload-outline" size={12} color={tokens.semantic.success} />
                        <Text style={[styles.metaText, { color: tokens.semantic.success }]}>
                          نُشر {fmtDate(s.published_at)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={(e) => { e.stopPropagation?.(); openEdit(s); }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="create-outline" size={16} color={tokens.brand[500]} />
                      <Text style={styles.actionText}>
                        {s.status === 'published' ? 'تعديل' : 'متابعة'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={(e) => { e.stopPropagation?.(); handleDelete(s); }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={16} color={tokens.semantic.danger} />
                      <Text style={[styles.actionText, { color: tokens.semantic.danger }]}>حذف</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </FadeSlideIn>
            );
          })}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.fab} onPress={openNew} activeOpacity={0.9}>
        <LinearGradient
          colors={dtokens.gradient.brand as any}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },

  card: {
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 14,
    marginVertical: 6,
    padding: 14,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    ...tokens.shadow.xs,
  },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 },
  statusPill: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99,
  },
  statusText: { fontSize: 11, fontWeight: '800' },
  title: { flex: 1, fontSize: 15, fontWeight: '800', color: tokens.text[1], textAlign: 'right' },
  body: { fontSize: 12, color: tokens.text[3], textAlign: 'right', marginBottom: 8, lineHeight: 18 },
  meta: { flexDirection: 'row-reverse', gap: 12, marginBottom: 10, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: tokens.text[4], fontWeight: '500' },

  actions: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    borderTopWidth: 1, borderTopColor: tokens.border[2], paddingTop: 8,
  },
  actionBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: tokens.radius.sm,
  },
  actionText: { fontSize: 12, fontWeight: '700', color: tokens.brand[500] },

  fab: {
    position: 'absolute', bottom: 26, left: 20,
    width: 58, height: 58, borderRadius: 29,
    ...tokens.shadow.md,
  },
  fabInner: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
  },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 6 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1] },
  emptyHint: { fontSize: 13, color: tokens.text[3], fontWeight: '500' },
});
