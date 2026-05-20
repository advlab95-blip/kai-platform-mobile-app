// ParentMedical — read-only view of child's medical record + medical alerts (brief §7.8).
// Flag-gated by `medical_records`.
// Data preserved verbatim:
//   api.getMedicalRecord(selectedChildId, childInstituteId, userId) — multi-tenant guard
//   childInstituteId = selectedChild?.instituteId || userInstituteId
//   notifications.filter((n) => n.type === 'medical') for alerts
//   No edit UI — strictly read-only per brief.
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import useParentStore from '../../stores/parentStore';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useNotificationStore from '../../stores/notificationStore';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { api } from '../../services/api';
import ChildSwitcher from '../../components/shared/ChildSwitcher';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import MedicalRow from '../../components/parent/medical/MedicalRow';
import MedicalAlertCard from '../../components/parent/medical/MedicalAlertCard';
import { tokens } from '../../constants/designTokens';
import { haptics } from '../../utils/haptics';

export default function ParentMedical() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { children, selectedChildId } = useParentStore();
  const { notifications } = useNotificationStore();
  const isMedicalEnabled = useFeatureFlag('medical_records');

  const selectedChild = children.find((c) => c.id === selectedChildId);
  const childInstituteId = selectedChild?.instituteId || userInstituteId;

  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecord = useCallback(async () => {
    if (!selectedChildId || !childInstituteId) {
      setRecord(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getMedicalRecord(selectedChildId, childInstituteId, userId || undefined);
      setRecord(data || null);
    } catch (err: any) {
      setRecord(null);
      setLoadError(err?.message || t('common.loadFailed', { defaultValue: 'فشل التحميل' }));
    } finally {
      setLoading(false);
    }
  }, [selectedChildId, childInstituteId, userId, t]);

  useEffect(() => { loadRecord(); }, [loadRecord]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadRecord(); } finally { setRefreshing(false); }
  }, [loadRecord]);

  const medicalAlerts = notifications.filter((n: any) => n.type === 'medical');

  // Feature-disabled lock state.
  if (!isMedicalEnabled) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <RoleInnerHero
          title={t('parent.medical', { defaultValue: 'السجلات الطبية' })}
          gradient={tokens.gradient.parent}
          glowAccent="rgba(167,139,250,0.30)"
          fallbackRoute="/(parent)/services"
        />
        <View style={styles.lockBox}>
          <Ionicons name="lock-closed" size={56} color={tokens.color.text4} />
          <Text style={styles.lockText}>
            {t('parent.medicalLocked', {
              defaultValue: 'ميزة السجلات الطبية غير مفعّلة لهذه المؤسسة',
            })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('parent.medical', { defaultValue: 'السجلات الطبية' })}
        gradient={tokens.gradient.parent}
        glowAccent="rgba(167,139,250,0.30)"
        fallbackRoute="/(parent)/services"
      />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.p600} />
        }
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        <ChildSwitcher />

        {!selectedChild ? (
          <View style={styles.emptyBox}>
            <Ionicons name="people-outline" size={48} color={tokens.color.text4} />
            <Text style={styles.emptyText}>
              {t('parent.noLinkedStudents', { defaultValue: 'لا يوجد طالب مرتبط' })}
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            {/* Child header card */}
            <View style={styles.childHeader}>
              <View style={styles.childAvatar}>
                <Ionicons name="medkit" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.childName}>{selectedChild.name}</Text>
                <Text style={styles.childSub}>
                  {t('parent.medical', { defaultValue: 'السجلات الطبية' })}
                </Text>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator color={tokens.color.p600} style={{ marginTop: 40 }} />
            ) : !record ? (
              <View style={styles.emptyBox}>
                <Ionicons name="document-outline" size={48} color={tokens.color.text4} />
                <Text style={styles.emptyText}>
                  {t('parent.noMedicalRecord', { defaultValue: 'لا يوجد سجل طبي مُسجَّل لهذا الطالب' })}
                </Text>
              </View>
            ) : (
              <View style={styles.card}>
                <MedicalRow label="فصيلة الدم" value={record.blood_type} icon="water" color={tokens.color.fieldHeart} />
                <MedicalRow label="ضغط الدم" value={record.blood_pressure} icon="pulse" color={tokens.color.fieldThermo} />
                <MedicalRow label="مستوى السكر" value={record.sugar_level} icon="fitness" color={tokens.color.success} />
                <MedicalRow label="فحص النظر" value={record.eyes} icon="eye" color={tokens.color.fieldEye} />
                <MedicalRow label="فحص الأسنان" value={record.dental} icon="medical" color={tokens.color.purple} />
                <MedicalRow label="الحساسيات" value={record.allergies} icon="warning" color={tokens.color.danger} multiline />
                <MedicalRow label="الأمراض المزمنة" value={record.chronic_conditions} icon="heart" color={tokens.color.pink} multiline />
                {record.updated_at ? (
                  <Text style={styles.updatedAt}>
                    {t('parent.lastUpdated', { defaultValue: 'آخر تحديث' })}: {new Date(record.updated_at).toLocaleDateString('ar-IQ')}
                  </Text>
                ) : null}
              </View>
            )}

            {/* Medical alerts */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {t('parent.medicalAlerts', { defaultValue: 'التنبيهات الطبية' })}
              </Text>
              <Ionicons name="notifications" size={18} color={tokens.color.p600} />
            </View>

            {medicalAlerts.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="checkmark-circle-outline" size={40} color={tokens.color.text4} />
                <Text style={styles.emptyText}>
                  {t('parent.noMedicalAlerts', { defaultValue: 'لا توجد تنبيهات طبية' })}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {medicalAlerts.slice(0, 20).map((n: any) => (
                  <MedicalAlertCard
                    key={n.id}
                    title={n.title}
                    message={n.message}
                    createdAt={n.created_at}
                    unread={!n.is_read}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  lockBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  lockText: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text3,
    marginTop: 16,
    textAlign: 'center',
  },
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
    marginVertical: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  childAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: tokens.color.medical,
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
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: 4,
  },
  updatedAt: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text3,
    textAlign: 'center',
    marginTop: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
    textAlign: 'right',
  },
});
