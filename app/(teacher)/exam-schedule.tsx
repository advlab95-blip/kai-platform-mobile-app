// شاشة الأستاذ — جدول الامتحانات (تابز):
//   • مراقبتي : أيام مراقبته من جداول الإدارة المنشورة (RLS يضمن العزل)
//   • امتحاناتي الفصلية : امتحانات أضافها بنفسه لطلاب صفه
// زر عائم "+" لإضافة امتحان فصلي جديد.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import {
  getTeacherExamSchedule, getTeacherQuizzes, deleteTeacherQuiz,
  type ExamScheduleItem, type TeacherQuiz,
} from '../../services/examScheduleService';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { haptics } from '../../utils/haptics';
import TeacherQuizCreateSheet from '../../components/teacher/exam-schedule/TeacherQuizCreateSheet';
import { confirmAlert } from '../../utils/alerts';

function fmtArDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ar-IQ', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  } catch { return iso; }
}

function isPastDate(iso: string): boolean {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(iso); d.setHours(0,0,0,0);
  return d.getTime() < today.getTime();
}

export default function TeacherExamSchedule() {
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const [tab, setTab] = useState<'proctoring' | 'quizzes'>('proctoring');
  const [items, setItems] = useState<ExamScheduleItem[]>([]);
  const [quizzes, setQuizzes] = useState<TeacherQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [proct, qz] = await Promise.all([
        getTeacherExamSchedule(userId),
        getTeacherQuizzes(userId),
      ]);
      setItems(proct);
      setQuizzes(qz);
    } catch (err) {
      console.error('load teacher exams', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const groupedProct = useMemo(() => {
    const m = new Map<string, ExamScheduleItem[]>();
    for (const it of items) {
      if (!m.has(it.exam_date)) m.set(it.exam_date, []);
      m.get(it.exam_date)!.push(it);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const groupedQuizzes = useMemo(() => {
    const m = new Map<string, TeacherQuiz[]>();
    for (const q of quizzes) {
      if (!m.has(q.quiz_date)) m.set(q.quiz_date, []);
      m.get(q.quiz_date)!.push(q);
    }
    return Array.from(m.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [quizzes]);

  const handleDeleteQuiz = (q: TeacherQuiz) => {
    confirmAlert(
      'حذف الامتحان',
      `هل تريد حذف "${q.title}"؟ (لن يرى الطلاب هذا الامتحان بعد الآن)`,
      async () => {
        try {
          await deleteTeacherQuiz(q.id);
          setQuizzes((prev) => prev.filter((x) => x.id !== q.id));
          haptics.success();
        } catch (e: any) {
          Alert.alert('خطأ', e?.message || 'فشل الحذف');
        }
      },
      true,
      'حذف',
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="جدول الامتحانات"
        subtitle="مراقبتك + امتحاناتك الفصلية"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabPill, tab === 'proctoring' && styles.tabPillActive]}
          onPress={() => { haptics.selection(); setTab('proctoring'); }}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, tab === 'proctoring' && styles.tabTextActive]}>
            مراقبتي · {items.length}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabPill, tab === 'quizzes' && styles.tabPillActive]}
          onPress={() => { haptics.selection(); setTab('quizzes'); }}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, tab === 'quizzes' && styles.tabTextActive]}>
            امتحاناتي الفصلية · {quizzes.length}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={tokens.brand[500]} style={{ marginTop: 60 }} />
      ) : tab === 'proctoring' ? (
        items.length === 0 ? (
          <EmptyState icon="document-text-outline" title="لا توجد أيام مراقبة" subtitle="سيظهر هنا أي امتحان أُسندت إليه مراقبته" />
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 60, paddingHorizontal: 16 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />}
            showsVerticalScrollIndicator={false}
          >
            {groupedProct.map(([date, dayItems]) => (
              <View key={date} style={styles.dayBlock}>
                <Text style={styles.dayTitle}>{fmtArDate(date)}</Text>
                {dayItems.map(it => (
                  <View key={it.id} style={styles.examCard}>
                    <View style={styles.examIconWrap}>
                      <Ionicons name="document-text" size={22} color={tokens.brand[500]} />
                    </View>
                    <View style={styles.examMain}>
                      <Text style={styles.examSubject} numberOfLines={1}>{it.subject_name}</Text>
                      <View style={styles.examMeta}>
                        <View style={styles.metaItem}>
                          <Ionicons name="school-outline" size={12} color={tokens.text[3]} />
                          <Text style={styles.metaText}>{it.class_name || '—'}</Text>
                        </View>
                        <View style={styles.metaItem}>
                          <Ionicons name="time-outline" size={12} color={tokens.text[3]} />
                          <Text style={styles.metaText}>
                            {(it.start_time || '').slice(0, 5)} · {it.duration_minutes} د
                          </Text>
                        </View>
                        {it.hall && (
                          <View style={styles.metaItem}>
                            <Ionicons name="location-outline" size={12} color={tokens.text[3]} />
                            <Text style={styles.metaText}>{it.hall}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        )
      ) : (
        quizzes.length === 0 ? (
          <EmptyState
            icon="add-circle-outline"
            title="لم تضف امتحانات فصلية بعد"
            subtitle="اضغط على زر + لإضافة امتحان قصير لصفك. الطلاب وأولياء الأمور سيصلهم إشعار."
          />
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 120, paddingHorizontal: 16 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />}
            showsVerticalScrollIndicator={false}
          >
            {groupedQuizzes.map(([date, dayItems]) => {
              const past = isPastDate(date);
              return (
                <View key={date} style={styles.dayBlock}>
                  <Text style={[styles.dayTitle, past && { color: tokens.text[3], backgroundColor: dtokens.color.surface2 }]}>{fmtArDate(date)}</Text>
                  {dayItems.map(q => (
                    <View key={q.id} style={[styles.examCard, past && { opacity: 0.7 }]}>
                      <View style={[styles.examIconWrap, { backgroundColor: '#E0F2FE' }]}>
                        <Ionicons name="school" size={22} color="#0284C7" />
                      </View>
                      <View style={styles.examMain}>
                        <Text style={[styles.examSubject, past && { textDecorationLine: 'line-through' as const, color: tokens.text[3] }]} numberOfLines={1}>{q.title}</Text>
                        {q.topic ? <Text style={{ fontSize: 12, color: tokens.text[2], textAlign: 'right', marginBottom: 4 }} numberOfLines={2}>{q.topic}</Text> : null}
                        <View style={styles.examMeta}>
                          <View style={styles.metaItem}>
                            <Ionicons name="school-outline" size={12} color={tokens.text[3]} />
                            <Text style={styles.metaText}>{q.class_name || '—'}</Text>
                          </View>
                          {q.subject_name ? (
                            <View style={styles.metaItem}>
                              <Ionicons name="book-outline" size={12} color={tokens.text[3]} />
                              <Text style={styles.metaText}>{q.subject_name}</Text>
                            </View>
                          ) : null}
                          <View style={styles.metaItem}>
                            <Ionicons name="time-outline" size={12} color={tokens.text[3]} />
                            <Text style={styles.metaText}>{(q.start_time || '').slice(0, 5)} · {q.duration_minutes} د</Text>
                          </View>
                        </View>
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteQuiz(q)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={18} color={dtokens.color.danger} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              );
            })}
          </ScrollView>
        )
      )}

      {/* FAB — visible only on quizzes tab */}
      {tab === 'quizzes' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            if (!userInstituteId) {
              Alert.alert('تنبيه', 'لم يتم تحديد المؤسسة بعد، أعد فتح الشاشة');
              return;
            }
            haptics.selection();
            setShowCreate(true);
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      <TeacherQuizCreateSheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        teacherId={userId || ''}
        instituteId={userInstituteId || ''}
        onCreated={(q) => setQuizzes((prev) => [q, ...prev])}
      />
    </SafeAreaView>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={icon} size={44} color={tokens.brand[500]} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 8 },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: tokens.text[1] },
  emptySubtitle: { fontSize: 13, color: tokens.text[3], textAlign: 'center' },

  tabsRow: {
    flexDirection: 'row-reverse', gap: 8,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4,
  },
  tabPill: {
    flex: 1, paddingVertical: 9, borderRadius: 999,
    backgroundColor: dtokens.color.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  tabPillActive: { backgroundColor: tokens.brand[500] },
  tabText: { fontSize: 13, fontWeight: '800', color: tokens.text[2] },
  tabTextActive: { color: '#fff' },

  dayBlock: { marginTop: 12 },
  dayTitle: {
    fontSize: 13, fontWeight: '800', color: tokens.brand[500],
    textAlign: 'right', marginBottom: 8,
    paddingHorizontal: 8, paddingVertical: 6,
    backgroundColor: tokens.brand[100],
    borderRadius: tokens.radius.sm,
  },
  examCard: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    backgroundColor: tokens.surface.surface,
    padding: 12,
    borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.border[2],
    marginBottom: 8,
    ...tokens.shadow.xs,
  },
  examIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },
  examMain: { flex: 1, minWidth: 0 },
  examSubject: {
    fontSize: 14, fontWeight: '800',
    color: tokens.text[1], textAlign: 'right', marginBottom: 4,
  },
  examMeta: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: tokens.text[3], fontWeight: '600' },

  fab: {
    position: 'absolute',
    bottom: 28, left: 22,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#0284C7',
    alignItems: 'center', justifyContent: 'center',
    ...tokens.shadow.md,
    elevation: 6,
  },
});
