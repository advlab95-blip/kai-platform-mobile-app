// ParentAttendance — child switcher + big ring + 3-stat row + warning + records list.
// Data flow:
//   useParentStore (Zustand) → children, selectedChildId, childAttendance, childAttendanceRecords
//   loadChildData(childId, undefined, userId) on child change + pull-to-refresh.
//   api.createJustification(childId, recordId, reason) on justify submit.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import useParentStore from '../../stores/parentStore';
import useAuthStore from '../../stores/authStore';
import { api } from '../../services/api';
import ChildSwitcher from '../../components/shared/ChildSwitcher';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import AttendanceRing from '../../components/parent/rings/AttendanceRing';
import AttendanceRecordRow from '../../components/parent/attendance/AttendanceRecordRow';
import JustifyAbsenceSheet from '../../components/parent/attendance/JustifyAbsenceSheet';

import { tokens } from '../../constants/designTokens';
import { haptics } from '../../utils/haptics';

export default function ParentAttendance() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { selectedChildId, childAttendance, childAttendanceRecords, loadChildData } = useParentStore();

  const [refreshing, setRefreshing] = useState(false);
  const [justifyVisible, setJustifyVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [justifyReason, setJustifyReason] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (selectedChildId) loadChildData(selectedChildId, undefined, userId || undefined);
  }, [selectedChildId, userId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (selectedChildId) await loadChildData(selectedChildId, undefined, userId || undefined);
    } finally {
      setRefreshing(false);
    }
  }, [selectedChildId, userId]);

  const openJustify = useCallback((record: any) => {
    setSelectedRecord(record);
    setJustifyReason('');
    setJustifyVisible(true);
  }, []);

  const handleSubmitJustification = useCallback(async () => {
    if (!justifyReason.trim()) {
      Alert.alert(t('common.error'), t('parent.writeReason', { defaultValue: 'الرجاء كتابة سبب الغياب' }));
      return;
    }
    if (!selectedRecord?.id || !selectedChildId) {
      setJustifyVisible(false);
      return;
    }
    setSending(true);
    try {
      await api.createJustification(selectedChildId, selectedRecord.id, justifyReason.trim());
      Alert.alert(t('common.success'), t('parent.justificationSent', { defaultValue: 'تم إرسال التبرير' }));
      setJustifyVisible(false);
      if (selectedChildId) await loadChildData(selectedChildId, undefined, userId || undefined);
    } catch (err: any) {
      Alert.alert(
        t('common.error'),
        err.message || t('parent.justificationFailed', { defaultValue: 'فشل إرسال التبرير' }),
      );
    } finally {
      setSending(false);
    }
  }, [justifyReason, selectedChildId, selectedRecord, userId, t, loadChildData]);

  const showWarning =
    childAttendance.percentage < 80 && childAttendance.total > 0;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('parent.attendance', { defaultValue: 'الحضور' })}
        gradient={tokens.gradient.parent}
        glowAccent="rgba(167,139,250,0.30)"
        showBack={false}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.color.p600}
          />
        }
      >
        <ChildSwitcher />

        <View style={styles.content}>
          {/* Big ring + 3-stat row */}
          <View style={styles.card}>
            <View style={styles.ringWrap}>
              <AttendanceRing percentage={childAttendance.percentage} size={160} showLabel />
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: tokens.color.success }]}>
                  {childAttendance.present}
                </Text>
                <Text style={styles.statLabel}>
                  {t('parent.attendancePresent', { defaultValue: 'حاضرة' })}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: tokens.color.danger }]}>
                  {childAttendance.absent}
                </Text>
                <Text style={styles.statLabel}>
                  {t('parent.attendanceAbsent', { defaultValue: 'غياب' })}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: tokens.color.text3 }]}>
                  {childAttendance.total}
                </Text>
                <Text style={styles.statLabel}>
                  {t('parent.attendanceTotal', { defaultValue: 'المجموع' })}
                </Text>
              </View>
            </View>
          </View>

          {showWarning ? (
            <View style={styles.warningBanner}>
              <Ionicons name="warning" size={20} color={tokens.color.warning} />
              <Text style={styles.warningText}>
                {t('parent.attendanceWarningFull', {
                  defaultValue: 'نسبة حضور الطالبة تحت 80٪ — قد تؤثر على شهادتها. يرجى متابعة حضورها اليومي.',
                })}
              </Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>
            {t('parent.attendanceRecords', { defaultValue: 'السجلات' })}
          </Text>
          {childAttendanceRecords.length === 0 ? (
            <Text style={styles.empty}>
              {t('parent.noAttendanceRecords', { defaultValue: 'لا توجد سجلات حضور' })}
            </Text>
          ) : (
            childAttendanceRecords.map((record: any) => (
              <AttendanceRecordRow
                key={record.id}
                record={record}
                onJustify={openJustify}
              />
            ))
          )}

          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>

      <JustifyAbsenceSheet
        visible={justifyVisible}
        onClose={() => setJustifyVisible(false)}
        reason={justifyReason}
        onChangeReason={setJustifyReason}
        onSubmit={handleSubmitJustification}
        sending={sending}
        context={selectedRecord ? { date: selectedRecord.date, subject: selectedRecord.timetables?.subject } : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  header: { paddingHorizontal: 20, paddingTop: tokens.spacing[4], paddingBottom: tokens.spacing[2] },
  headerTitle: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
    textAlign: 'right',
  },
  content: { paddingHorizontal: tokens.spacing[4], paddingTop: tokens.spacing[2] },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing[5],
    marginBottom: tokens.spacing[4],
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.sm,
  },
  ringWrap: { alignItems: 'center', paddingVertical: tokens.spacing[3] },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: tokens.spacing[4],
    paddingTop: tokens.spacing[4],
    borderTopWidth: 1,
    borderTopColor: tokens.color.border2,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: tokens.color.border2,
  },
  statValue: {
    fontSize: tokens.font.size['2xl'],
    fontWeight: tokens.font.weight.black,
  },
  statLabel: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text2,
    fontWeight: tokens.font.weight.semi,
    marginTop: 2,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    backgroundColor: tokens.color.warningBg,
    borderRadius: tokens.radius.lg,
    padding: 14,
    marginBottom: tokens.spacing[4],
  },
  warningText: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.bold,
    color: '#92400E',
    flex: 1,
    textAlign: 'right',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: tokens.spacing[3],
  },
  empty: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: tokens.spacing[5],
  },
  bottomSpacer: { height: 30 },
});
