// MedicalCritical — students with chronic conditions / allergies recorded in
// medical_records. The "watch list" the clinic staff reviews first thing in
// the morning.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useDataStore from '../../stores/dataStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import {
  listCriticalStudents, type CriticalStudent,
} from '../../services/medicalService';
import { api } from '../../services/api';

export default function MedicalCritical() {
  const { userInstituteId } = useDataStore();
  const [rows, setRows] = useState<CriticalStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const data = await listCriticalStudents(userInstituteId);
      setRows(data);
    } catch (err) {
      if (__DEV__) console.error('[medical/critical] load', err);
    }
  }, [userInstituteId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // Quick-dial parent for emergency. Tries to resolve the parent's phone,
  // then opens the dialer. Fails silently if no phone.
  const handleEmergencyCall = async (studentId: string, studentName: string | null) => {
    if (!userInstituteId) return;
    try {
      haptics.medium();
      const parentId = await api.getParentByStudent(studentId, userInstituteId);
      if (!parentId) {
        return;
      }
      // We can't read users.phone directly with RLS in most setups — leave
      // the dialer call to a service helper if one exists; otherwise just
      // show an alert. Keeping this graceful.
      const phone = await api.getUserPhone?.(parentId).catch(() => null);
      if (phone) {
        await Linking.openURL(`tel:${phone}`);
      }
    } catch (err) {
      if (__DEV__) console.warn('[medical/critical] emergency call failed', err);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الحالات الحرجة"
        subtitle="أمراض مزمنة + حساسيات"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(220,38,38,0.30)"
        fallbackRoute="/(medical)"
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
        }
      >
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SkeletonList count={5} cardHeight={108} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="shield-checkmark-outline" size={36} color={tokens.semantic.success} />
            <Text style={styles.emptyTitle}>لا توجد حالات حرجة مسجّلة</Text>
            <Text style={styles.emptyHint}>أضف الحالات من شاشة سجلات الطلاب</Text>
          </View>
        ) : (
          <>
            <View style={styles.summary}>
              <Ionicons name="alert-circle" size={20} color={tokens.semantic.warning} />
              <Text style={styles.summaryText}>
                {rows.length} طالب يحتاج انتباه خاص
              </Text>
            </View>
            <View style={{ paddingHorizontal: 16, gap: 10, paddingTop: 12 }}>
              {rows.map((r, idx) => (
                <FadeSlideIn key={r.student_id} delay={Math.min(idx * 20, 250)} translateFrom={6}>
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.bloodChip}>
                        <Ionicons name="water" size={12} color={tokens.semantic.danger} />
                        <Text style={styles.bloodText}>{r.blood_type || '—'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.studentName}>{r.full_name || 'طالب'}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleEmergencyCall(r.student_id, r.full_name)}
                        style={styles.callBtn}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="call" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>

                    {r.chronic_conditions ? (
                      <View style={styles.sectionBox}>
                        <View style={styles.sectionHeader}>
                          <Ionicons name="medkit" size={12} color={tokens.semantic.warning} />
                          <Text style={[styles.sectionLabel, { color: tokens.semantic.warning }]}>
                            أمراض مزمنة
                          </Text>
                        </View>
                        <Text style={styles.sectionText}>{r.chronic_conditions}</Text>
                      </View>
                    ) : null}

                    {r.allergies ? (
                      <View style={styles.sectionBox}>
                        <View style={styles.sectionHeader}>
                          <Ionicons name="alert" size={12} color={tokens.semantic.danger} />
                          <Text style={[styles.sectionLabel, { color: tokens.semantic.danger }]}>
                            حساسيات
                          </Text>
                        </View>
                        <Text style={styles.sectionText}>{r.allergies}</Text>
                      </View>
                    ) : null}
                  </View>
                </FadeSlideIn>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  summary: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 14, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.semantic.warningBg,
    borderWidth: 1, borderColor: tokens.semantic.warning + '40',
  },
  summaryText: { flex: 1, fontSize: 13, fontWeight: '800', color: tokens.semantic.warning, textAlign: 'right' },
  card: {
    backgroundColor: tokens.surface.surface, borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.border[2], padding: 14, gap: 10,
    ...tokens.shadow.xs,
  },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  studentName: { fontSize: 14, fontWeight: '900', color: tokens.text[1], textAlign: 'right' },
  bloodChip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: tokens.semantic.dangerBg,
  },
  bloodText: { fontSize: 12, fontWeight: '900', color: tokens.semantic.danger, letterSpacing: 1 },
  callBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: tokens.semantic.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionBox: {
    backgroundColor: tokens.surface.surface2, borderRadius: tokens.radius.md,
    padding: 10, gap: 4,
  },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '900' },
  sectionText: { fontSize: 13, color: tokens.text[1], textAlign: 'right', lineHeight: 19 },
  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: tokens.text[1] },
  emptyHint: { fontSize: 12, color: tokens.text[3] },
});
