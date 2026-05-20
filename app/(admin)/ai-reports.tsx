import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import useDataStore from '../../stores/dataStore';
import { supabase, supabaseAdmin } from '../../services/supabase';
import { exportAIUsageReportPDF } from '../../services/pdfExport';
import { haptics } from '../../utils/haptics';

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const FEATURE_LABELS: Record<string, string> = {
  chat: 'محادثة AI', summary: 'ملخصات', quiz: 'توليد أسئلة',
  study_guide: 'دليل مذاكرة', mindmap: 'خرائط ذهنية', general: 'عام',
};
const ROLE_LABELS: Record<string, string> = {
  student: 'الطلاب', teacher: 'الأساتذة', parent: 'أولياء الأمور', admin: 'الإدارة',
};

// Generate last 12 months (current + 11 previous) for the picker
function getMonthOptions(): { year: number; month: number; label: string }[] {
  const opts: { year: number; month: number; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: `${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}` });
  }
  return opts;
}

type Report = {
  totals: any;
  by_feature: Record<string, any>;
  by_role: Record<string, any>;
  top_users: any[];
  timeline: any[];
};

export default function AdminAIReports() {
  const { institutes, loadInstitutes } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedInst, setSelectedInst] = useState('');
  const monthOptions = getMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => { if (institutes.length === 0) loadInstitutes(); }, []);

  const loadReport = useCallback(async () => {
    if (!selectedInst) return;
    setLoading(true);
    try {
      const client = supabaseAdmin || supabase;
      const { data, error } = await client.rpc('get_institute_ai_monthly_report', {
        p_institute_id: selectedInst,
        p_year: selectedMonth.year,
        p_month: selectedMonth.month,
      });
      if (error) throw error;
      setReport(data as Report);
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل تحميل التقرير');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [selectedInst, selectedMonth]);

  useEffect(() => { if (selectedInst) loadReport(); }, [selectedInst, selectedMonth, loadReport]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadReport(); } finally { setRefreshing(false); }
  }, [loadReport]);

  const handleExportPDF = async () => {
    if (!report || !selectedInst) return;
    const inst = institutes.find((i: any) => i.id === selectedInst) as any;
    const instituteName = inst?.name || 'المؤسسة';
    setExporting(true);
    try {
      await exportAIUsageReportPDF({
        instituteName,
        year: selectedMonth.year,
        month: selectedMonth.month,
        totals: {
          total_requests: report.totals?.total_requests || 0,
          total_input_tokens: report.totals?.total_input_tokens || 0,
          total_output_tokens: report.totals?.total_output_tokens || 0,
          total_cost_usd: Number(report.totals?.total_cost_usd || 0),
          total_cost_iqd: Number(report.totals?.total_cost_iqd || 0),
          total_savings_usd: Number(report.totals?.total_savings_usd || 0),
          cached_requests: report.totals?.cached_requests || 0,
        },
        byFeature: report.by_feature || {},
        byRole: report.by_role || {},
        topUsers: (report.top_users || []).map((u: any) => ({
          user_id: u.user_id,
          user_name: u.user_name,
          user_role: u.user_role,
          requests: u.requests,
          cost: Number(u.cost || 0),
        })),
        timeline: (report.timeline || []).map((t: any) => ({
          day: t.day,
          requests: t.requests,
          cost: Number(t.cost || 0),
        })),
      });
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل تصدير PDF');
    } finally {
      setExporting(false);
    }
  };

  const renderInstitutePicker = () => (
    <View style={{ paddingHorizontal: 16 }}>
      <Text style={s.sectionTitle}>اختر المؤسسة</Text>
      {institutes.map((inst: any) => (
        <TouchableOpacity
          key={inst.id}
          style={s.instCard}
          onPress={() => setSelectedInst(inst.id)}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={s.instName}>{inst.name}</Text>
            <Text style={s.instType}>{inst.type === 'school' ? 'مدرسة' : 'معهد'}</Text>
          </View>
          <View style={s.instIcon}>
            <Ionicons name={inst.type === 'school' ? 'school' : 'business'} size={20} color="#7C3AED" />
          </View>
        </TouchableOpacity>
      ))}
      {institutes.length === 0 && <Text style={s.emptyText}>لا توجد مؤسسات</Text>}
    </View>
  );

  const t = report?.totals || {};
  const byFeature = report?.by_feature || {};
  const byRole = report?.by_role || {};
  const topUsers = report?.top_users || [];
  const timeline = report?.timeline || [];
  const hasData = (t.total_requests || 0) > 0;

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="تقارير استهلاك AI"
        subtitle="استهلاك رصيد الذكاء الاصطناعي لكل مؤسسة — شهرياً مع تصدير PDF"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >

        {!selectedInst ? renderInstitutePicker() : (
          <View style={{ paddingHorizontal: 16 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}
              onPress={() => { setSelectedInst(''); setReport(null); }}
            >
              <Ionicons name="arrow-forward" size={20} color="#7C3AED" />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#7C3AED' }}>
                {(institutes.find((i: any) => i.id === selectedInst) as any)?.name}
              </Text>
            </TouchableOpacity>

            {/* Month picker */}
            <Text style={s.sectionTitle}>اختر الشهر</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              style={{ marginBottom: 16 }}
            >
              {monthOptions.map(m => {
                const isActive = m.year === selectedMonth.year && m.month === selectedMonth.month;
                return (
                  <TouchableOpacity
                    key={`${m.year}-${m.month}`}
                    style={[s.monthChip, isActive && s.monthChipActive]}
                    onPress={() => setSelectedMonth(m)}
                  >
                    <Text style={[s.monthChipText, isActive && s.monthChipTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {loading ? (
              <ActivityIndicator color="#7C3AED" style={{ paddingVertical: 40 }} />
            ) : !hasData ? (
              <View style={s.emptyCard}>
                <Ionicons name="bar-chart-outline" size={48} color="#CBD5E1" />
                <Text style={s.emptyText}>لا توجد بيانات لهذا الشهر</Text>
              </View>
            ) : (
              <>
                {/* Totals */}
                <Text style={s.sectionTitle}>📊 الملخّص الشهري</Text>
                <View style={s.statsGrid}>
                  <StatBox label="إجمالي الطلبات" value={String(t.total_requests || 0)} color="#7C3AED" />
                  <StatBox label="التكلفة ($)" value={`$${Number(t.total_cost_usd || 0).toFixed(4)}`} color="#059669" />
                  <StatBox label="التكلفة (د.ع)" value={`${Math.round(Number(t.total_cost_iqd || 0)).toLocaleString('ar-IQ')}`} color="#B45309" />
                  <StatBox label="من الكاش" value={`${Math.round((t.cached_requests || 0) / Math.max(1, t.total_requests) * 100)}%`} color="#2563EB" />
                  <StatBox label="Input Tokens" value={(t.total_input_tokens || 0).toLocaleString('ar-IQ')} color="#475569" small />
                  <StatBox label="Output Tokens" value={(t.total_output_tokens || 0).toLocaleString('ar-IQ')} color="#475569" small />
                  <StatBox label="توفير الكاش" value={`$${Number(t.total_savings_usd || 0).toFixed(4)}`} color="#059669" small />
                  <StatBox label="طلبات الكاش" value={String(t.cached_requests || 0)} color="#2563EB" small />
                </View>

                {/* By Feature */}
                <Text style={s.sectionTitle}>🤖 حسب الميزة</Text>
                {Object.entries(byFeature).map(([key, v]: any) => (
                  <View key={key} style={s.listRow}>
                    <Text style={s.listCost}>${Number(v.cost_usd || 0).toFixed(4)}</Text>
                    <Text style={s.listCount}>{v.requests} طلب</Text>
                    <Text style={s.listName}>{FEATURE_LABELS[key] || key}</Text>
                  </View>
                ))}

                {/* By Role */}
                <Text style={s.sectionTitle}>👥 حسب الدور</Text>
                {Object.entries(byRole).map(([key, v]: any) => (
                  <View key={key} style={s.listRow}>
                    <Text style={s.listCost}>${Number(v.cost_usd || 0).toFixed(4)}</Text>
                    <Text style={s.listCount}>{v.requests} طلب</Text>
                    <Text style={s.listName}>{ROLE_LABELS[key] || key}</Text>
                  </View>
                ))}

                {/* Top users */}
                <Text style={s.sectionTitle}>🏆 أكثر المستخدمين استهلاكاً</Text>
                {topUsers.slice(0, 10).map((u: any, i: number) => (
                  <View key={u.user_id} style={s.listRow}>
                    <Text style={s.listCost}>${Number(u.cost || 0).toFixed(4)}</Text>
                    <Text style={s.listCount}>{u.requests} طلب</Text>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={s.listName}>{u.user_name || u.user_id?.slice(0, 8)}</Text>
                      <Text style={s.listSub}>{ROLE_LABELS[u.user_role] || u.user_role}</Text>
                    </View>
                    <View style={s.rankBadge}><Text style={s.rankText}>{i + 1}</Text></View>
                  </View>
                ))}

                {/* Timeline */}
                <Text style={s.sectionTitle}>📈 النشاط اليومي</Text>
                {timeline.map((d: any) => {
                  const maxReq = Math.max(1, ...timeline.map((x: any) => x.requests));
                  const pct = (d.requests / maxReq) * 100;
                  const dayLabel = new Date(d.day).toLocaleDateString('ar-IQ', { day: '2-digit', month: '2-digit' });
                  return (
                    <View key={d.day} style={s.barRow}>
                      <Text style={s.barLabel}>{dayLabel}</Text>
                      <View style={s.barTrack}>
                        <View style={[s.barFill, { width: `${pct}%` }]} />
                        <Text style={s.barVal}>{d.requests}</Text>
                      </View>
                      <Text style={s.barCost}>${Number(d.cost || 0).toFixed(3)}</Text>
                    </View>
                  );
                })}

                {/* Export PDF */}
                <TouchableOpacity
                  style={[s.exportBtn, exporting && { opacity: 0.6 }]}
                  onPress={handleExportPDF}
                  disabled={exporting}
                  activeOpacity={0.8}
                >
                  {exporting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="document-text" size={18} color="#fff" />
                      <Text style={s.exportBtnText}>تصدير PDF</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ label, value, color, small }: { label: string; value: string; color: string; small?: boolean }) {
  return (
    <View style={[s.statBox, small && { flexBasis: '48%' }]}>
      <Text style={[s.statVal, { color, fontSize: small ? 14 : 18 }]}>{value}</Text>
      <Text style={s.statLbl}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  subtitle: { fontSize: 12, color: Colors.textSecondary, textAlign: 'right', marginTop: 4, lineHeight: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'right', marginTop: 16, marginBottom: 10 },
  instCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 18, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  instIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#F5F3FF',
    alignItems: 'center', justifyContent: 'center', marginLeft: 12,
  },
  instName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  instType: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  monthChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.border,
  },
  monthChipActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  monthChipText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  monthChipTextActive: { color: '#fff' },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  statBox: {
    flexBasis: '23%', flexGrow: 1,
    backgroundColor: '#fff', borderRadius: 14, padding: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  statVal: { fontWeight: '900' },
  statLbl: { fontSize: 9, color: Colors.textMuted, marginTop: 4, fontWeight: '700', textAlign: 'center' },

  listRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: Colors.border, gap: 10,
  },
  listCost: { fontSize: 12, color: '#059669', fontWeight: '800', minWidth: 70, textAlign: 'center' },
  listCount: { fontSize: 11, color: Colors.textMuted, fontWeight: '700' },
  listName: { fontSize: 13, fontWeight: '800', color: Colors.text, flex: 1, textAlign: 'right' },
  listSub: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  rankBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#F5F3FF',
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { fontSize: 12, fontWeight: '900', color: '#7C3AED' },

  barRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4,
  },
  barLabel: { width: 50, fontSize: 10, color: Colors.textMuted, fontWeight: '700', textAlign: 'center' },
  barTrack: {
    flex: 1, height: 22, backgroundColor: '#F1F5F9', borderRadius: 11, overflow: 'hidden',
    justifyContent: 'center',
  },
  barFill: {
    position: 'absolute', top: 0, bottom: 0, right: 0,
    backgroundColor: '#7C3AED', borderRadius: 11,
  },
  barVal: {
    paddingHorizontal: 10, fontSize: 10, fontWeight: '900', color: Colors.text,
    textAlign: 'left',
  },
  barCost: { width: 55, fontSize: 10, color: '#059669', fontWeight: '700', textAlign: 'center' },

  exportBtn: {
    backgroundColor: '#7C3AED', borderRadius: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 20,
  },
  exportBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  emptyCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 40,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 12 },
});
