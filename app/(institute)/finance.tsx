import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, TouchableOpacity, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import KeyboardAwareScroll from '../../components/shared/KeyboardAwareScroll';
import SectionLabel from '../../components/institute/SectionLabel';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';

type StudentSummary = { id: string; name: string; totalPaid: number; payments: any[] };

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('ar-IQ').format(Math.round(n));
}

export default function InstituteFinance() {
  const { userId } = useAuthStore();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const list = await api.getStudentPaymentsSummary(userInstituteId);
      setStudents(list as StudentSummary[]);
    } catch (err) {
      if (__DEV__) console.error('finance load', err);
    } finally {
      setLoading(false);
    }
  }, [userInstituteId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) detectInstitute(userId);
  }, [userInstituteId, userId, isFetching, detectInstitute]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const stats = useMemo(() => {
    const paying = students.filter((s) => s.totalPaid > 0);
    const totalPaid = paying.reduce((sum, s) => sum + s.totalPaid, 0);
    const avg = paying.length > 0 ? totalPaid / paying.length : 0;
    const totalPayments = students.reduce((sum, s) => sum + (s.payments?.length || 0), 0);
    return {
      totalPaid,
      payingCount: paying.length,
      totalStudents: students.length,
      avg,
      totalPayments,
    };
  }, [students]);

  const filtered = useMemo(() => {
    const nq = q.trim();
    if (!nq) return students;
    return students.filter((s) => s.name.includes(nq));
  }, [q, students]);

  if (!userInstituteId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={tokens.brand[500]} />
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="المالية"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        showBack={false}
      />

      {loading ? (
        <ActivityIndicator color={tokens.brand[500]} style={{ marginTop: 60 }} />
      ) : (
        <KeyboardAwareScroll
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
          }
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SectionLabel title="ملخص مالي" icon="wallet-outline" />
          </View>

          <View style={styles.statsGrid}>
            <FadeSlideIn delay={0} translateFrom={10}>
              <View style={[styles.statCard, { backgroundColor: tokens.semantic.successBg }]}>
                <Ionicons name="cash-outline" size={22} color={tokens.semantic.success} />
                <Text style={[styles.statValue, { color: tokens.semantic.success }]}>
                  {fmtMoney(stats.totalPaid)}
                </Text>
                <Text style={styles.statLabel}>إجمالي المدفوع</Text>
              </View>
            </FadeSlideIn>

            <FadeSlideIn delay={60} translateFrom={10}>
              <View style={[styles.statCard, { backgroundColor: tokens.brand[100] }]}>
                <Ionicons name="people-outline" size={22} color={tokens.brand[500]} />
                <Text style={[styles.statValue, { color: tokens.brand[500] }]}>
                  {stats.payingCount}/{stats.totalStudents}
                </Text>
                <Text style={styles.statLabel}>طلاب دافعون</Text>
              </View>
            </FadeSlideIn>

            <FadeSlideIn delay={120} translateFrom={10}>
              <View style={[styles.statCard, { backgroundColor: tokens.semantic.infoBg }]}>
                <Ionicons name="trending-up-outline" size={22} color={tokens.semantic.info} />
                <Text style={[styles.statValue, { color: tokens.semantic.info }]}>
                  {fmtMoney(stats.avg)}
                </Text>
                <Text style={styles.statLabel}>متوسط / طالب</Text>
              </View>
            </FadeSlideIn>

            <FadeSlideIn delay={180} translateFrom={10}>
              <View style={[styles.statCard, { backgroundColor: tokens.semantic.warningBg }]}>
                <Ionicons name="receipt-outline" size={22} color={tokens.semantic.warning} />
                <Text style={[styles.statValue, { color: tokens.semantic.warning }]}>
                  {stats.totalPayments}
                </Text>
                <Text style={styles.statLabel}>عمليات دفع</Text>
              </View>
            </FadeSlideIn>
          </View>

          <View style={{ paddingHorizontal: 16, marginTop: 6 }}>
            <SectionLabel title="قائمة الطلاب" icon="list-outline" />
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={tokens.text[4]} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="ابحث باسم الطالب..."
              placeholderTextColor={tokens.text[4]}
              style={styles.searchInput}
              textAlign="right"
            />
            {q.length > 0 && (
              <TouchableOpacity onPress={() => setQ('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="close-circle" size={16} color={tokens.text[4]} />
              </TouchableOpacity>
            )}
          </View>

          {filtered.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="wallet-outline" size={36} color={tokens.brand[500]} />
              </View>
              <Text style={styles.emptyTitle}>لا توجد بيانات</Text>
              <Text style={styles.emptyHint}>
                {q ? 'جرّب بحث آخر' : 'سجّل أول دفعة من شاشة المستخدمين'}
              </Text>
            </View>
          ) : (
            filtered.map((s, i) => {
              const hasPaid = s.totalPaid > 0;
              return (
                <FadeSlideIn key={s.id} delay={Math.min(i * 30, 400)} translateFrom={8}>
                  <View style={styles.row}>
                    <View style={[styles.avatar, { backgroundColor: hasPaid ? tokens.semantic.successBg : tokens.surface.surface2 }]}>
                      <Ionicons
                        name={hasPaid ? 'checkmark-circle' : 'time-outline'}
                        size={18}
                        color={hasPaid ? tokens.semantic.success : tokens.text[4]}
                      />
                    </View>
                    <View style={styles.rowMain}>
                      <Text style={styles.rowName} numberOfLines={1}>{s.name}</Text>
                      <Text style={styles.rowMeta}>
                        {s.payments?.length || 0} عملية دفع
                      </Text>
                    </View>
                    <View style={styles.amountWrap}>
                      <Text style={[styles.amountValue, { color: hasPaid ? tokens.semantic.success : tokens.text[4] }]}>
                        {fmtMoney(s.totalPaid)}
                      </Text>
                      <Text style={styles.amountLabel}>د.ع</Text>
                    </View>
                  </View>
                </FadeSlideIn>
              );
            })
          )}
        </KeyboardAwareScroll>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 13, color: tokens.text[3], fontWeight: '500' },

  statsGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    width: '48%',
    padding: 14,
    borderRadius: tokens.radius.lg,
    gap: 6,
    ...tokens.shadow.xs,
  },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, color: tokens.text[3], fontWeight: '600' },

  searchWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[2],
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    ...tokens.shadow.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: tokens.text[1],
    padding: 0,
  },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 14,
    marginVertical: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[2],
    ...tokens.shadow.xs,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14, fontWeight: '700', color: tokens.text[1], textAlign: 'right' },
  rowMeta: { fontSize: 11, color: tokens.text[3], fontWeight: '500', textAlign: 'right', marginTop: 2 },
  amountWrap: { alignItems: 'flex-start', minWidth: 80 },
  amountValue: { fontSize: 15, fontWeight: '800' },
  amountLabel: { fontSize: 10, color: tokens.text[4], fontWeight: '600' },

  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1] },
  emptyHint: { fontSize: 13, color: tokens.text[3], fontWeight: '500' },
});
