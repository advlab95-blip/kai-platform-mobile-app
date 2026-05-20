import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useStudentStore from '../../stores/studentStore';
import { haptics } from '../../utils/haptics';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import StatCard from '../../components/teacher/cards/StatCard';

type Tier = 'excellent' | 'veryGood' | 'good' | 'needs';

interface LevelSpec {
  label: string;
  tierKey: Tier;
  gradient: readonly [string, string, ...string[]];
  icon: React.ComponentProps<typeof Ionicons>['name'];
  shadow: any;
}

export default function StudentReports() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const {
    attendanceSummary,
    tasks,
    exams,
    weeklyTimetable,
    loadStudentData,
  } = useStudentStore();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (userId && userInstituteId) {
        await loadStudentData(userId, userInstituteId);
      }
    } finally {
      setRefreshing(false);
    }
  }, [userId, userInstituteId, loadStudentData]);

  // --- Stats derivation (DO NOT change formulas) ---
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t: any) => t.status === 'completed').length;
  const pendingTasks = totalTasks - completedTasks;

  const totalExams = exams.length;
  // session.grade_published_at GUARD — only count grades the teacher actually published.
  // Using just status==='graded' would leak unpublished work to the student's avg.
  const gradedExams = exams.filter(
    (e: any) => e.session?.status === 'returned' && e.session?.grade_published_at
  ).length;
  const scoredExams = exams.filter(
    (e: any) => e.session?.status === 'returned' && e.session?.grade_published_at
  );
  const avgScore =
    scoredExams.length > 0
      ? Math.round(
          scoredExams.reduce((sum: number, e: any) => sum + (e.session?.score ?? 0), 0) /
            scoredExams.length
        )
      : 0;

  const attendPct = attendanceSummary?.percentage || 0;
  const totalClasses = weeklyTimetable?.length || 0;

  // EXACT formula — do not change.
  const overallScore = Math.round(
    attendPct * 0.3 +
      (completedTasks / Math.max(totalTasks, 1)) * 100 * 0.3 +
      avgScore * 0.4
  );

  const level: LevelSpec =
    overallScore >= 85
      ? {
          label: t('student.excellent'),
          tierKey: 'excellent',
          gradient: tokens.gradient.success,
          icon: 'trophy',
          shadow: { shadowColor: tokens.color.success, shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
        }
      : overallScore >= 75
      ? {
          label: t('student.veryGood'),
          tierKey: 'veryGood',
          gradient: tokens.gradient.teal,
          icon: 'checkmark-circle',
          shadow: tokens.shadow.teal,
        }
      : overallScore >= 60
      ? {
          label: t('student.good'),
          tierKey: 'good',
          gradient: tokens.gradient.warning,
          icon: 'thumbs-up',
          shadow: { shadowColor: tokens.color.warning, shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
        }
      : {
          label: t('student.needsImprovement'),
          tierKey: 'needs',
          gradient: tokens.gradient.danger,
          icon: 'alert-circle',
          shadow: tokens.shadow.danger,
        };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('student.performanceReport')}
        subtitle={t('student.performanceSummary')}
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
        fallbackRoute="/(student)/services"
      />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.color.teal600}
          />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >

        {/* Overall performance card */}
        <View style={[styles.overallWrap, level.shadow]}>
          <LinearGradient
            colors={level.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.overallCard}
          >
            <View style={styles.overallShine} pointerEvents="none" />
            <View style={styles.overallIconCircle}>
              <Ionicons name={level.icon} size={36} color="#fff" />
            </View>
            <Text style={styles.overallValue} allowFontScaling={false}>
              {overallScore}%
            </Text>
            <Text style={styles.overallLabel}>{level.label}</Text>
          </LinearGradient>
        </View>

        {/* 2x2 stat grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statRow}>
            <StatCard
              label={t('student.attendanceStat')}
              value={`${attendPct}%`}
              gradient="success"
              icon="checkmark-circle"
            />
            <StatCard
              label={t('student.assignmentsStat')}
              value={`${completedTasks}/${totalTasks}`}
              gradient="purple"
              icon="document-text"
            />
          </View>
          <View style={styles.statRow}>
            <StatCard
              label={t('student.examAverage')}
              value={avgScore}
              gradient="info"
              icon="school"
            />
            <StatCard
              label={t('student.weeklyClasses')}
              value={totalClasses}
              gradient="orange"
              icon="calendar"
            />
          </View>
        </View>

        {/* Attendance details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('student.attendanceDetails')}</Text>
          <View style={styles.detailCard}>
            <DetailCell
              value={attendanceSummary?.present ?? 0}
              label={t('student.presentLabel')}
              color={tokens.color.success}
            />
            <Divider />
            <DetailCell
              value={attendanceSummary?.absent ?? 0}
              label={t('student.absentLabel')}
              color={tokens.color.danger}
            />
            <Divider />
            <DetailCell
              value={attendanceSummary?.total ?? 0}
              label={t('student.totalLabel')}
              color={tokens.color.info}
            />
          </View>
        </View>

        {/* Task details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('student.taskDetails')}</Text>
          <View style={styles.detailCard}>
            <DetailCell
              value={completedTasks}
              label={t('student.submittedStat')}
              color={tokens.color.success}
            />
            <Divider />
            <DetailCell
              value={pendingTasks}
              label={t('student.pendingStat')}
              color={tokens.color.warning}
            />
            <Divider />
            <DetailCell
              value={totalTasks}
              label={t('student.totalLabel')}
              color={tokens.color.purple}
            />
          </View>
        </View>

        {/* Exam details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('student.examDetails')}</Text>
          <View style={styles.detailCard}>
            <DetailCell
              value={gradedExams}
              label={t('student.gradedStat')}
              color={tokens.color.info}
            />
            <Divider />
            <DetailCell
              value={`${avgScore}%`}
              label={t('student.averageStat')}
              color={tokens.color.success}
            />
            <Divider />
            <DetailCell
              value={totalExams}
              label={t('student.totalLabel')}
              color={tokens.color.warning}
            />
          </View>
        </View>

        {/* Tips */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('student.tipsTitle')}</Text>
          {attendPct < 80 ? (
            <TipCard
              tone="danger"
              icon="warning"
              text={t('student.tipAttendanceLow')}
            />
          ) : null}
          {pendingTasks > 0 ? (
            <TipCard
              tone="warning"
              icon="time"
              text={t('student.tipPendingTasks', { count: pendingTasks })}
            />
          ) : null}
          {avgScore < 70 && avgScore > 0 ? (
            <TipCard
              tone="purple"
              icon="school"
              text={t('student.tipExamLow')}
            />
          ) : null}
          {overallScore >= 85 ? (
            <TipCard
              tone="success"
              icon="trophy"
              text={t('student.tipExcellent')}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Helpers ---
function DetailCell({
  value,
  label,
  color,
}: {
  value: number | string;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.detailCell}>
      <Text style={[styles.detailValue, { color }]} allowFontScaling={false}>
        {value}
      </Text>
      <Text style={styles.detailLabel}>{label}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.detailDivider} />;
}

type TipTone = 'success' | 'warning' | 'danger' | 'purple';

function TipCard({
  tone,
  icon,
  text,
}: {
  tone: TipTone;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  const spec = {
    success: { accent: tokens.color.success, bg: tokens.color.successBg },
    warning: { accent: tokens.color.warning, bg: tokens.color.warningBg },
    danger:  { accent: tokens.color.danger,  bg: tokens.color.dangerBg  },
    purple:  { accent: tokens.color.purple,  bg: tokens.color.purpleBg  },
  }[tone];
  return (
    <View style={[styles.tipCard, { borderRightColor: spec.accent }]}>
      <View style={[styles.tipIcon, { backgroundColor: spec.bg }]}>
        <Ionicons name={icon} size={18} color={spec.accent} />
      </View>
      <Text style={styles.tipText} numberOfLines={3}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 6,
  },
  subtitle: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'right',
  },
  overallWrap: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 18,
    borderRadius: tokens.radius.xl,
  },
  overallCard: {
    borderRadius: tokens.radius.xl,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  overallShine: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.12)',
    top: -50,
    end: -40,
  },
  overallIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  overallValue: {
    fontSize: 44,
    color: '#fff',
    fontWeight: tokens.font.weight.heavy,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  overallLabel: {
    fontSize: tokens.font.size.xl,
    color: '#fff',
    opacity: 0.95,
    fontWeight: tokens.font.weight.heavy,
    marginTop: 4,
  },
  statsGrid: {
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 10,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
  },
  section: { paddingHorizontal: 16, marginTop: 14 },
  sectionTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 10,
  },
  detailCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    paddingVertical: 18,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    ...tokens.shadow.xs,
  },
  detailCell: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  detailValue: {
    fontSize: tokens.font.size['2xl'],
    fontWeight: tokens.font.weight.heavy,
    fontVariant: ['tabular-nums'],
  },
  detailLabel: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text3,
  },
  detailDivider: {
    width: 1,
    height: 40,
    backgroundColor: tokens.color.border,
  },
  tipCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: 14,
    marginBottom: 8,
    borderRightWidth: 4,
    borderWidth: 1,
    borderColor: tokens.color.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...tokens.shadow.xs,
  },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: {
    flex: 1,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
    textAlign: 'right',
    lineHeight: 22,
  },
});
