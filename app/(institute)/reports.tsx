import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/theme';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { exportGradesReportPDF, exportAnalyticsReportPDF } from '../../services/pdfExport';
import { useTranslation } from 'react-i18next';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SkeletonList from '../../components/shared/SkeletonList';
import { tokens as dtokens } from '../../constants/designTokens';
import { haptics } from '../../utils/haptics';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import SectionLabel from '../../components/institute/SectionLabel';

export default function InstituteReports() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { userInstituteId, institutes, isFetching, detectInstitute } = useDataStore();
  const instName = institutes.find(i => i.id === userInstituteId)?.name || t('institute.instituteInfo');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [selectedCat, setSelectedCat] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadData = async () => {
    if (!userInstituteId) return;
    try {
      const [cats, allGrades, instStats] = await Promise.all([
        api.getGradeCategories(userInstituteId),
        api.getAllGradesForInstitute(userInstituteId),
        api.getInstituteStats(userInstituteId),
      ]);
      setCategories(cats);
      setGrades(allGrades.data || []);
      setStats(instStats);
    } catch (err: any) {
      if (__DEV__) console.error(err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [userInstituteId]);
  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }, [userInstituteId]);

  const filteredGrades = selectedCat ? grades.filter(g => g.category_id === selectedCat) : grades;

  const totalStudents = new Set(filteredGrades.map(g => g.student_id)).size;
  const weightedScores = filteredGrades.map(g => {
    const pct = (g.score / (g.grade_categories?.max_score || g.max_score || 100)) * 100;
    const weight = g.grade_categories?.weight || 1;
    return { pct, weight };
  });
  const totalWeight = weightedScores.reduce((sum, s) => sum + s.weight, 0);
  const average = totalWeight > 0
    ? Math.round(weightedScores.reduce((sum, s) => sum + s.pct * s.weight, 0) / totalWeight)
    : 0;
  const scores = weightedScores.map(s => s.pct);
  const highest = scores.length > 0 ? Math.round(Math.max(...scores)) : 0;
  const lowest = scores.length > 0 ? Math.round(Math.min(...scores)) : 0;
  const passRate = scores.length > 0 ? Math.round(scores.filter(s => s >= 50).length / scores.length * 100) : 0;

  const handleExportGrades = async () => {
    if (filteredGrades.length === 0) { Alert.alert(t('common.warning'), t('institute.noGradesToExport')); return; }
    setExporting(true);
    try {
      const catName = selectedCat ? categories.find(c => c.id === selectedCat)?.name : t('institute.allCategories');
      await exportGradesReportPDF({
        title: `تقرير الدرجات — ${instName}`,
        instituteName: instName,
        categoryName: catName,
        grades: filteredGrades.map(g => ({
          studentName: g.users?.full_name || 'طالب',
          subject: g.subject,
          score: g.score,
          maxScore: g.grade_categories?.max_score || g.max_score || 100,
          category: g.grade_categories?.name,
        })),
        summary: { average, highest, lowest, passRate, totalStudents },
      });
    } catch (err: any) { Alert.alert(t('common.error'), err.message); } finally {
      setExporting(false);
    }
  };

  const handleExportAnalytics = async () => {
    setExporting(true);
    try {
      const subjectMap = new Map<string, number[]>();
      filteredGrades.forEach(g => {
        const pct = (g.score / (g.grade_categories?.max_score || g.max_score || 100)) * 100;
        if (!subjectMap.has(g.subject)) subjectMap.set(g.subject, []);
        subjectMap.get(g.subject)!.push(pct);
      });
      const subjectRows = Array.from(subjectMap.entries()).map(([subject, pcts]) => ({
        label: subject,
        value: `${Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)}% (${pcts.length} طالب)`,
      }));

      const catRows = categories.map(cat => {
        const catGrades = grades.filter(g => g.category_id === cat.id);
        const catScores = catGrades.map(g => (g.score / (cat.max_score || 100)) * 100);
        const catAvg = catScores.length > 0 ? Math.round(catScores.reduce((a, b) => a + b, 0) / catScores.length) : 0;
        return { label: cat.name, value: `معدل ${catAvg}% — ${catGrades.length} درجة` };
      });

      await exportAnalyticsReportPDF({
        title: `تقرير تحليلي شامل — ${instName}`,
        instituteName: instName,
        stats: [
          { label: t('institute.totalStudents'), value: String(stats?.totalStudents || 0) },
          { label: t('institute.totalTeachers'), value: String(stats?.totalTeachers || 0) },
          { label: t('institute.attendancePercentage'), value: `${stats?.attendancePercentage || 0}%` },
          { label: t('admin.passRate'), value: `${passRate}%` },
        ],
        sections: [
          { title: 'المعدل حسب المادة', rows: subjectRows },
          { title: 'المعدل حسب فئة الامتحان', rows: catRows },
        ],
      });
    } catch (err: any) { Alert.alert(t('common.error'), err.message); } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) {
      detectInstitute(userId);
    }
  }, [userInstituteId, userId, isFetching]);

  if (!userInstituteId) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerFill}>
          <ActivityIndicator size="large" color={tokens.brand[500]} />
          <Text style={s.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <SkeletonList count={6} cardHeight={72} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('institute.reportsTitle')}
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        showBack={false}
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        <View style={s.statsWrap}>
          <SectionLabel title="نظرة عامة" icon="stats-chart-outline" />
          <View style={s.statsRow}>
            <FadeSlideIn delay={0} translateFrom={10} style={{ flex: 1 }}>
              <View style={[s.statCard, { backgroundColor: tokens.brand[100] }]}>
                <Ionicons name="people" size={18} color={tokens.brand[500]} style={{ marginBottom: 4 }} />
                <Text style={[s.statVal, { color: tokens.brand[500] }]}>{totalStudents}</Text>
                <Text style={s.statLabel}>{t('institute.totalStudents')}</Text>
              </View>
            </FadeSlideIn>
            <FadeSlideIn delay={60} translateFrom={10} style={{ flex: 1 }}>
              <View style={[s.statCard, { backgroundColor: tokens.semantic.successBg }]}>
                <Ionicons name="trending-up" size={18} color={tokens.semantic.success} style={{ marginBottom: 4 }} />
                <Text style={[s.statVal, { color: tokens.semantic.success }]}>{average}%</Text>
                <Text style={s.statLabel}>{t('admin.average')}</Text>
              </View>
            </FadeSlideIn>
            <FadeSlideIn delay={120} translateFrom={10} style={{ flex: 1 }}>
              <View style={[s.statCard, { backgroundColor: tokens.semantic.warningBg }]}>
                <Ionicons name="checkmark-circle" size={18} color={tokens.semantic.warning} style={{ marginBottom: 4 }} />
                <Text style={[s.statVal, { color: tokens.semantic.warning }]}>{passRate}%</Text>
                <Text style={s.statLabel}>{t('admin.passRate')}</Text>
              </View>
            </FadeSlideIn>
            <FadeSlideIn delay={180} translateFrom={10} style={{ flex: 1 }}>
              <View style={[s.statCard, { backgroundColor: tokens.semantic.dangerBg }]}>
                <Ionicons name="arrow-down-circle" size={18} color={tokens.semantic.danger} style={{ marginBottom: 4 }} />
                <Text style={[s.statVal, { color: tokens.semantic.danger }]}>{lowest}</Text>
                <Text style={s.statLabel}>{t('institute.lowestGrade')}</Text>
              </View>
            </FadeSlideIn>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
          <SectionLabel title="الفئات" icon="filter-outline" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }} style={{ flexGrow: 0, marginBottom: 16 }}>
          <TouchableOpacity style={[s.chip, !selectedCat && s.chipActive]} onPress={() => { haptics.light(); setSelectedCat(''); }}>
            <Text style={[s.chipText, !selectedCat && s.chipTextActive]}>{t('common.all')} ({grades.length})</Text>
          </TouchableOpacity>
          {categories.map(cat => {
            const active = selectedCat === cat.id;
            return (
              <TouchableOpacity key={cat.id} style={[s.chip, active && s.chipActive]} onPress={() => { haptics.light(); setSelectedCat(cat.id); }}>
                <Text style={[s.chipText, active && s.chipTextActive]}>
                  {cat.name} ({grades.filter(g => g.category_id === cat.id).length})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
          <SectionLabel title="تصدير PDF" icon="document-text-outline" />
        </View>
        <View style={{ paddingHorizontal: 16, gap: 10, marginBottom: 18 }}>
          <TouchableOpacity
            style={[s.exportBtn, { backgroundColor: tokens.brand[500] }, exporting && { opacity: 0.6 }]}
            onPress={handleExportGrades} disabled={exporting}
            activeOpacity={0.85}
          >
            {exporting ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="document-text" size={18} color="#fff" />}
            <Text style={s.exportBtnText}>{t('institute.exportGradesReport')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.exportBtn, { backgroundColor: tokens.semantic.purple }, exporting && { opacity: 0.6 }]}
            onPress={handleExportAnalytics} disabled={exporting}
            activeOpacity={0.85}
          >
            {exporting ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="analytics" size={18} color="#fff" />}
            <Text style={s.exportBtnText}>{t('institute.exportAnalyticsReport')}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
          <SectionLabel title="الدرجات" icon="list-outline" />
        </View>

        {filteredGrades.length === 0 ? (
          <Text style={s.empty}>{t('admin.noGrades')}</Text>
        ) : filteredGrades.slice(0, 50).map((g, i) => {
          const max = g.grade_categories?.max_score || g.max_score || 100;
          const isPass = (g.score / max) >= 0.5;
          return (
            <FadeSlideIn key={g.id} delay={Math.min(i * 20, 400)} translateFrom={6}>
              <View style={s.gradeRow}>
                <Text style={[s.gradeScore, { color: isPass ? tokens.semantic.success : tokens.semantic.danger }]}>
                  {g.score}/{max}
                </Text>
                <View style={{ flex: 1, alignItems: 'flex-end', gap: 1 }}>
                  <Text style={s.gradeName}>{g.users?.full_name || 'طالب'}</Text>
                  <Text style={s.gradeMeta}>{g.subject} — {g.grade_categories?.name || ''}</Text>
                </View>
                <Text style={s.gradeIdx}>{i + 1}</Text>
              </View>
            </FadeSlideIn>
          );
        })}
        {filteredGrades.length > 50 && (
          <Text style={s.empty}>+{filteredGrades.length - 50} درجة أخرى — صدّر PDF للقائمة الكاملة</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 13, color: tokens.text[3], marginTop: 12, fontWeight: '500' },

  statsWrap: { paddingHorizontal: 16, marginTop: 10, marginBottom: 6 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    borderRadius: tokens.radius.md,
    paddingVertical: 14, paddingHorizontal: 8,
    alignItems: 'center',
  },
  statVal: { fontSize: 18, fontWeight: '900' },
  statLabel: { fontSize: 10, color: tokens.text[3], marginTop: 2, fontWeight: '600' },

  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface,
    borderWidth: 1, borderColor: tokens.border[2],
  },
  chipActive: { backgroundColor: tokens.brand[500], borderColor: tokens.brand[500] },
  chipText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
  chipTextActive: { color: '#fff' },

  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    ...tokens.shadow.xs,
  },
  exportBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  gradeRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.md,
    padding: 12, marginHorizontal: 16, marginBottom: 6,
    borderWidth: 1, borderColor: tokens.border[2],
    gap: 10,
    ...tokens.shadow.xs,
  },
  gradeName: { fontSize: 13, fontWeight: '800', color: tokens.text[1] },
  gradeMeta: { fontSize: 11, color: tokens.text[3], fontWeight: '500' },
  gradeScore: { fontSize: 15, fontWeight: '900', minWidth: 50, textAlign: 'center' },
  gradeIdx: { fontSize: 10, color: tokens.text[4], width: 24, textAlign: 'center', fontWeight: '700' },

  empty: { fontSize: 13, color: tokens.text[3], textAlign: 'center', paddingVertical: 30, fontWeight: '500' },
});
