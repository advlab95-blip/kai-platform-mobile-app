// ParentAcademic — exam results + per-subject progress rings + certificates (brief §7.5).
// Data preserved verbatim:
//   Promise.allSettled([api.getChildExamResults(childId, userId), api.getStudentCertificates(childId)])
//   <StudentProgress studentId={selectedChild.id} /> for per-subject rings
//   handleDownloadCert(cert) — exportGradeReportCertPDF flagship feature, untouched
//   overallAverage from scoredResults; StarRating local helper.
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import useParentStore from '../../stores/parentStore';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { exportGradeReportCertPDF } from '../../services/pdfExport';

import ChildSwitcher from '../../components/shared/ChildSwitcher';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import StudentProgress from '../../components/shared/StudentProgress';
import SubjectScoreCard from '../../components/parent/academic/SubjectScoreCard';
import CertificateCard from '../../components/parent/academic/CertificateCard';

import { tokens } from '../../constants/designTokens';
import { haptics } from '../../utils/haptics';

function StarRating({ rating }: { rating: number }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= rating ? 'star' : star - 0.5 <= rating ? 'star-half' : 'star-outline'}
          size={22}
          color={tokens.color.warning}
        />
      ))}
    </View>
  );
}

interface ExamResult {
  id: string;
  score: number | null;
  status: string;
  created_at: string;
  exams: any;
}

export default function ParentAcademic() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { children, selectedChildId } = useParentStore();
  const { userInstituteId, institutes } = useDataStore();
  const instName = institutes.find((i) => i.id === userInstituteId)?.name || '';
  const selectedChild = children.find((c) => c.id === selectedChildId);

  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadExamResults = async (childId: string) => {
    setIsLoading(true);
    // Use allSettled so one failing call doesn't wipe the other dataset
    const [examsR, certsR] = await Promise.allSettled([
      api.getChildExamResults(childId, userId || undefined),
      api.getStudentCertificates(childId),
    ]);
    setExamResults(examsR.status === 'fulfilled' ? (examsR.value || []) : []);
    setCertificates(certsR.status === 'fulfilled' ? (certsR.value || []) : []);
    setIsLoading(false);
  };

  const handleDownloadCert = async (cert: any) => {
    try {
      const extraData = cert.data || {};
      await exportGradeReportCertPDF({
        studentName: selectedChild?.name || t('roles.student'),
        instituteName: instName || cert.institutes?.name || '',
        title: cert.title,
        description: cert.description,
        grades: extraData.grades,
        issuedAt: cert.issued_at,
        type: extraData.type || cert.type || 'excellence',
        themeId: extraData.themeId || 'royal_gold',
        showEmoji: extraData.showEmoji,
        stampUrl: extraData.stampUrl,
        signatureUrl: extraData.signatureUrl,
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('parent.certDownloadFailed'));
    }
  };

  useEffect(() => {
    if (selectedChildId) loadExamResults(selectedChildId);
  }, [selectedChildId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (selectedChildId) await loadExamResults(selectedChildId);
    } finally {
      setRefreshing(false);
    }
  }, [selectedChildId]);

  // Calculate scores from real data
  const scoredResults = examResults.filter((r) => r.score != null && r.exams?.total_points);
  const overallAverage =
    scoredResults.length > 0
      ? scoredResults.reduce(
          (sum, r) => sum + ((r.score || 0) / (r.exams?.total_points || 1)) * 100,
          0,
        ) / scoredResults.length
      : 0;
  const starRating = Math.round((overallAverage / 100) * 5 * 2) / 2;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('parent.academicTitle', { defaultValue: 'التقرير الأكاديمي' })}
        gradient={tokens.gradient.parent}
        glowAccent="rgba(167,139,250,0.30)"
        fallbackRoute="/(parent)/services"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.p600} />
        }
      >
        <ChildSwitcher />

        <View style={styles.contentArea}>
          {!selectedChild ? (
            <View style={styles.emptyBox}>
              <Ionicons name="people-outline" size={48} color={tokens.color.text4} />
              <Text style={styles.emptyText}>
                {t('parent.noLinkedStudents', { defaultValue: 'لا يوجد طالب مرتبط' })}
              </Text>
            </View>
          ) : (
            <>
              {/* Child info card */}
              <View style={styles.childHeader}>
                <View style={styles.childAvatar}>
                  <Ionicons name="school" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.childName}>{selectedChild.name}</Text>
                  {instName ? <Text style={styles.childSub}>{instName}</Text> : null}
                </View>
              </View>

              {/* Per-subject progress rings */}
              <View style={{ marginBottom: 14 }}>
                <StudentProgress studentId={selectedChild.id} />
              </View>

              {isLoading ? (
                <ActivityIndicator size="large" color={tokens.color.p600} style={{ marginTop: 40 }} />
              ) : scoredResults.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="school-outline" size={48} color={tokens.color.text4} />
                  <Text style={styles.emptyText}>
                    {t('parent.noGradesRecorded', { defaultValue: 'لا توجد درجات مسجلة بعد' })}
                  </Text>
                </View>
              ) : (
                <>
                  {/* Overall assessment */}
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>
                      {t('parent.overallAssessment', { defaultValue: 'التقييم العام' })}
                    </Text>
                    <View style={styles.overallRow}>
                      <StarRating rating={starRating} />
                      <Text style={styles.overallScore}>{overallAverage.toFixed(0)}%</Text>
                    </View>
                    <Text style={styles.overallLabel}>
                      {t('parent.overallAverage', { count: scoredResults.length })}
                    </Text>
                  </View>

                  {/* Subject scores */}
                  <Text style={styles.sectionTitle}>
                    {t('parent.examScores', { defaultValue: 'درجات الامتحانات' })}
                  </Text>
                  {scoredResults.map((result) => (
                    <SubjectScoreCard
                      key={result.id}
                      title={result.exams?.title || t('parent.exam', { defaultValue: 'امتحان' })}
                      score={result.score || 0}
                      totalPoints={result.exams?.total_points || 1}
                    />
                  ))}
                </>
              )}

              {/* Certificates */}
              {certificates.length > 0 ? (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
                    {t('parent.certificatesCount', { count: certificates.length })}
                  </Text>
                  {certificates.map((cert: any) => (
                    <CertificateCard
                      key={cert.id}
                      title={cert.title}
                      issuedAt={cert.issued_at}
                      onDownload={() => handleDownloadCert(cert)}
                    />
                  ))}
                </>
              ) : null}

              <View style={{ height: 30 }} />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  contentArea: { paddingHorizontal: 16, paddingTop: 8 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyText: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    marginTop: 12,
    textAlign: 'center',
  },
  childHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tokens.color.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  childAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: tokens.color.p600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childName: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
  },
  childSub: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
    marginTop: 2,
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.sm,
  },
  cardTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 12,
  },
  overallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  overallScore: {
    fontSize: tokens.font.size['4xl'],
    fontWeight: tokens.font.weight.black,
    color: tokens.color.p600,
  },
  overallLabel: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
    textAlign: 'center',
  },
  starsRow: { flexDirection: 'row', gap: 2 },
  sectionTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 12,
  },
});
