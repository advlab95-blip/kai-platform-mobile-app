// ParentGrades — NEW screen (brief §7.10). Subject-grouped view of manual grades.
// Data: api.getStudentManualGrades(selectedChildId, childInstituteId, userId).
// Multi-tenant: childInstituteId from the selected child (children of one parent
// may be enrolled in different institutes).
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import useParentStore from '../../stores/parentStore';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';

import ChildSwitcher from '../../components/shared/ChildSwitcher';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import OverallGradeCard from '../../components/parent/grades/OverallGradeCard';
import CategoryFilterChip from '../../components/parent/grades/CategoryFilterChip';
import GradeSubjectCard, { SubjectGradeItem } from '../../components/parent/grades/GradeSubjectCard';
import SkeletonList from '../../components/shared/SkeletonList';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';

import { tokens } from '../../constants/designTokens';
import { haptics } from '../../utils/haptics';

const ALL_KEY = '__all__';

interface RawGrade {
  id: string;
  subject?: string | null;
  score: number;
  max_score: number;
  entered_at: string;
  grade_categories?: { name?: string; type?: string } | null;
  users?: { full_name?: string } | null;
}

function letterFor(pct: number) {
  if (pct >= 90) return 'A+';
  if (pct >= 85) return 'A';
  if (pct >= 80) return 'B+';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  return 'F';
}

export default function ParentGrades() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { children, selectedChildId } = useParentStore();
  const selectedChild = children.find((c) => c.id === selectedChildId);
  const childInstituteId = selectedChild?.instituteId || userInstituteId;

  const [grades, setGrades] = useState<RawGrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_KEY);

  const loadGrades = useCallback(async () => {
    if (!selectedChildId || !childInstituteId) {
      setGrades([]);
      return;
    }
    setLoading(true);
    try {
      setLoadError(null);
      const data = await api.getStudentManualGrades(
        selectedChildId,
        childInstituteId,
        userId || undefined,
      );
      setGrades((data as RawGrade[]) || []);
    } catch (err: any) {
      setGrades([]);
      setLoadError(err?.message || t('common.loadFailed', { defaultValue: 'تعذّر تحميل البيانات' }));
    } finally {
      setLoading(false);
    }
  }, [selectedChildId, childInstituteId, userId, t]);

  useEffect(() => { loadGrades(); }, [loadGrades]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadGrades(); } finally { setRefreshing(false); }
  }, [loadGrades]);

  // Category facets — counts per category (key by category name).
  const categoryFacets = useMemo(() => {
    const map = new Map<string, number>();
    map.set(ALL_KEY, grades.length);
    for (const g of grades) {
      const key = g.grade_categories?.name || t('parent.uncategorized', { defaultValue: 'فئة' });
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [grades, t]);

  // Filtered grades based on active category.
  const filteredGrades = useMemo(() => {
    if (activeCategory === ALL_KEY) return grades;
    return grades.filter(
      (g) => (g.grade_categories?.name || t('parent.uncategorized', { defaultValue: 'فئة' })) === activeCategory,
    );
  }, [grades, activeCategory, t]);

  // Group filtered grades by subject.
  const bySubject = useMemo(() => {
    const map = new Map<string, RawGrade[]>();
    for (const g of filteredGrades) {
      const key = g.subject || t('parent.unspecifiedSubject', { defaultValue: 'غير محدد' });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    return Array.from(map.entries()).map(([subject, items]) => {
      const avg = Math.round(
        items.reduce((s, g) => s + (g.score / Math.max(g.max_score, 1)) * 100, 0) / items.length,
      );
      const teacherName = items[0]?.users?.full_name;
      const mapped: SubjectGradeItem[] = items.map((g) => ({
        id: g.id,
        categoryName: g.grade_categories?.name || t('parent.uncategorized', { defaultValue: 'فئة' }),
        categoryType: g.grade_categories?.type,
        score: g.score,
        maxScore: g.max_score,
        enteredAt: g.entered_at,
      }));
      return { subject, items: mapped, avg, teacherName };
    });
  }, [filteredGrades, t]);

  // Overall stats (computed from full grades dataset, not filtered).
  const overall = useMemo(() => {
    if (grades.length === 0) return { pct: 0, letter: '—' };
    const pct = Math.round(
      grades.reduce((s, g) => s + (g.score / Math.max(g.max_score, 1)) * 100, 0) / grades.length,
    );
    return { pct, letter: letterFor(pct) };
  }, [grades]);

  const subjectCount = useMemo(() => {
    const set = new Set<string>();
    for (const g of grades) set.add(g.subject || '__unspec__');
    return set.size;
  }, [grades]);

  const categoryCount = Math.max(0, categoryFacets.length - 1); // exclude __all__

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('parent.gradesTitle', { defaultValue: 'الدرجات المنشورة' })}
        gradient={tokens.gradient.parent}
        glowAccent="rgba(167,139,250,0.30)"
        fallbackRoute="/(parent)/services"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.p600} />
        }
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        <ChildSwitcher />

        <View style={styles.body}>
          {!selectedChild ? (
            <EmptyState
              icon="people-outline"
              title={t('parent.noLinkedStudents', { defaultValue: 'لا يوجد طالب مرتبط' })}
            />
          ) : loading ? (
            <SkeletonList count={5} />
          ) : loadError ? (
            <ErrorState
              title={t('common.loadFailedTitle', { defaultValue: 'تعذّر تحميل الدرجات' })}
              message={loadError}
              retryLabel={t('common.retry', { defaultValue: 'إعادة المحاولة' })}
              onRetry={loadGrades}
            />
          ) : grades.length === 0 ? (
            <EmptyState
              icon="trophy-outline"
              title={t('parent.noGradesPublished', { defaultValue: 'لا توجد درجات منشورة بعد' })}
            />
          ) : (
            <>
              {/* Overall card */}
              <OverallGradeCard
                pct={overall.pct}
                letter={overall.letter}
                totalGrades={grades.length}
                subjectCount={subjectCount}
                categoryCount={categoryCount}
              />

              {/* Category filter chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {categoryFacets.map(([key, count]) => (
                  <CategoryFilterChip
                    key={key}
                    label={key === ALL_KEY ? t('parent.allCategories', { defaultValue: 'الكل' }) : key}
                    count={count}
                    active={activeCategory === key}
                    onPress={() => setActiveCategory(key)}
                  />
                ))}
              </ScrollView>

              {/* Subject cards (filtered) */}
              {bySubject.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    {t('parent.noGradesInCategory', { defaultValue: 'لا توجد درجات في هذه الفئة' })}
                  </Text>
                </View>
              ) : (
                bySubject.map((sub) => (
                  <GradeSubjectCard
                    key={sub.subject}
                    subject={sub.subject}
                    teacherName={sub.teacherName}
                    avg={sub.avg}
                    items={sub.items}
                  />
                ))
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  body: { paddingHorizontal: 16, paddingTop: 8 },
  emptyBox: { alignItems: 'center', paddingVertical: 50 },
  emptyText: {
    fontSize: tokens.font.size.lg,
    color: tokens.color.text3,
    marginTop: 12,
    textAlign: 'center',
    fontWeight: tokens.font.weight.bold,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    marginBottom: 8,
  },
});
