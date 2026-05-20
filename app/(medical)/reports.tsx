// Medical reports — orchestration only.
// Data flow:
//   useMedicalStore.loadStats + loadAllRecords (Supabase via api, instituteId-scoped)
//   useMedicalReportStats memoizes derived counts (replaces per-render aggregation).
//   exportAIToolOutputPDF builds a real PDF from the assembled outputText.
//   Feature gate: useFeatureFlag('medical_records'). When off → <LockedScreen />.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { exportAIToolOutputPDF } from '../../services/pdfExport';
import useDataStore from '../../stores/dataStore';
import useMedicalStore from '../../stores/medicalStore';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { tokens } from '../../constants/designTokens';
import { BLOOD_TYPES } from '../../constants/medical';
import { haptics } from '../../utils/haptics';

import RoleInnerHero from '../../components/shared/RoleInnerHero';
import LockedScreen from '../../components/medical/shared/LockedScreen';
import CoverageCard from '../../components/medical/reports/CoverageCard';
import BloodTypeDistribution from '../../components/medical/reports/BloodTypeDistribution';
import HealthFieldOverview from '../../components/medical/reports/HealthFieldOverview';
import CommonConditionsCard from '../../components/medical/reports/CommonConditionsCard';
import ExportButton from '../../components/medical/reports/ExportButton';
import { useMedicalReportStats } from '../../components/medical/hooks/useMedicalReportStats';

export default function MedicalReports() {
  const { t } = useTranslation();
  const { userInstituteId } = useDataStore();
  const { stats, allRecords, loadStats, loadAllRecords } = useMedicalStore();
  const isEnabled = useFeatureFlag('medical_records');
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (userInstituteId) {
      loadStats(userInstituteId);
      loadAllRecords(userInstituteId);
    }
  }, [userInstituteId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (userInstituteId) {
        await Promise.all([loadStats(userInstituteId), loadAllRecords(userInstituteId)]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [userInstituteId]);

  const derived = useMedicalReportStats(allRecords as any[], stats);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      let report = `إجمالي الطلاب: ${stats.totalStudents}\n`;
      report += `سجلات مكتملة: ${stats.withRecords}\n`;
      report += `نسبة التغطية: ${derived.coveragePercent}%\n\n`;

      report += `--- توزيع فصائل الدم ---\n`;
      for (const type of BLOOD_TYPES) {
        const count = derived.bloodTypeCounts[type] || 0;
        if (count > 0) report += `${type}: ${count}\n`;
      }

      report += `\n--- البيانات الصحية ---\n`;
      report += `ضغط الدم: ${derived.withPressure}\n`;
      report += `مستوى السكر: ${derived.withSugar}\n`;
      report += `صحة العيون: ${derived.withEyes}\n`;
      report += `صحة الأسنان: ${derived.withDental}\n`;
      report += `حساسية أدوية: ${derived.withAllergies}\n`;
      report += `أمراض مزمنة: ${derived.withChronic}\n`;

      if (derived.sortedConditions.length > 0) {
        report += `\n--- الحالات الشائعة ---\n`;
        for (const [condition, count] of derived.sortedConditions) {
          report += `${condition}: ${count}\n`;
        }
      }

      // Export as proper PDF (was .txt before — poor UX)
      await exportAIToolOutputPDF({
        title: `تقرير الطبابة — ${new Date().toLocaleDateString('ar-IQ')}`,
        toolName: t('medical.exportReport', { defaultValue: 'تقرير الطبابة' }),
        outputText: report,
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('medical.reportExportFailed'));
    } finally {
      setExporting(false);
    }
  }, [derived, stats, t]);

  if (!isEnabled) return <LockedScreen />;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('medical.reportsTitle')}
        gradient={tokens.gradient.medical}
        glowAccent="rgba(239,68,68,0.30)"
        showBack={false}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.color.m600}
          />
        }
      >
        <View style={styles.contentArea}>
          <CoverageCard
            withRecords={stats.withRecords}
            totalStudents={stats.totalStudents}
            coveragePercent={derived.coveragePercent}
          />
          <BloodTypeDistribution
            bloodTypeCounts={derived.bloodTypeCounts}
            maxCount={derived.maxBT}
          />
          <HealthFieldOverview
            totalRecords={allRecords.length}
            withPressure={derived.withPressure}
            withSugar={derived.withSugar}
            withEyes={derived.withEyes}
            withDental={derived.withDental}
            withAllergies={derived.withAllergies}
            withChronic={derived.withChronic}
          />
          <CommonConditionsCard sortedConditions={derived.sortedConditions} />
          <ExportButton onPress={handleExport} busy={exporting} />
          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
    textAlign: 'right',
  },
  contentArea: { paddingHorizontal: tokens.spacing[4], paddingTop: 8 },
  bottomSpacer: { height: 30 },
});
