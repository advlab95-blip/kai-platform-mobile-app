// Institute Live Attendance — real-time view of today's attendance, grouped by
// class/section. Pulls fresh records on mount + auto-refreshes every 30s + listens
// to Supabase realtime on the `attendance` table so fingerprint scans appear
// without a manual refresh. Designed for school institutes (fingerprint hardware)
// and standard institutes (manual / QR scans alike) — `method` is surfaced but
// not required.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, LayoutAnimation,
  Platform, UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { supabase } from '../../services/supabase';
import { tokens as dtokens } from '../../constants/designTokens';
import { tokens } from '../../constants/theme';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SkeletonList from '../../components/shared/SkeletonList';
import SectionLabel from '../../components/institute/SectionLabel';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type AttRow = {
  id: string;
  student_id: string;
  class_id: string | null;
  date: string;
  status: 'present' | 'late' | 'absent' | 'excused' | string;
  method?: string | null;
  created_at: string;
};

type StudentLite = { id: string; full_name: string };

type ClassGroup = {
  id: string;
  name: string;
  parentName?: string;
  records: (AttRow & { studentName: string; time: string })[];
  present: number;
  late: number;
  absent: number;
  total: number;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function statusVisual(s: string) {
  if (s === 'present') return { label: 'حاضر', color: dtokens.color.success, bg: dtokens.color.successBg, icon: 'checkmark-circle' as const };
  if (s === 'late')    return { label: 'متأخر', color: dtokens.color.warning, bg: dtokens.color.warningBg, icon: 'time' as const };
  if (s === 'absent')  return { label: 'غائب', color: dtokens.color.danger,  bg: dtokens.color.dangerBg,  icon: 'close-circle' as const };
  if (s === 'excused') return { label: 'مستأذن', color: dtokens.color.info,   bg: dtokens.color.infoBg,    icon: 'document-text' as const };
  return { label: s, color: tokens.text[3], bg: tokens.surface.surface2, icon: 'help-circle' as const };
}

function methodLabel(m: string | null | undefined) {
  if (!m) return null;
  const k = m.toLowerCase();
  if (k.includes('finger') || k === 'بصمة' || k === 'biometric') return { label: 'بصمة', icon: 'finger-print' as const };
  if (k === 'qr' || k.includes('qr')) return { label: 'QR', icon: 'qr-code' as const };
  if (k.includes('manual') || k === 'يدوي') return { label: 'يدوي', icon: 'create' as const };
  return { label: m, icon: 'pulse' as const };
}

export default function InstituteLiveAttendance() {
  const { userId } = useAuthStore();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<AttRow[]>([]);
  const [classNameById, setClassNameById] = useState<Record<string, { name: string; parent?: string }>>({});
  const [studentNameById, setStudentNameById] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<'all' | 'present' | 'late' | 'absent'>('all');

  const lastLoadRef = useRef<number>(0);

  const load = useCallback(async (silent = false) => {
    if (!userInstituteId) return;
    const now = Date.now();
    if (now - lastLoadRef.current < 1000 && silent) return;
    lastLoadRef.current = now;

    if (!silent) setLoading(true);
    try {
      const today = todayISO();
      const { data: attData, error } = await supabase
        .from('attendance')
        .select('id, student_id, class_id, date, status, method, created_at')
        .eq('institute_id', userInstituteId)
        .eq('date', today)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;

      const attRows = (attData || []) as AttRow[];
      setRows(attRows);

      // Resolve class/section names + parent labels in one pass
      const classIds = Array.from(new Set(attRows.map(r => r.class_id).filter(Boolean))) as string[];
      const studentIds = Array.from(new Set(attRows.map(r => r.student_id).filter(Boolean)));

      const [classesRes, sectionsRes, gradesRes, usersRes] = await Promise.all([
        classIds.length ? supabase.from('classes').select('id, name').in('id', classIds) : Promise.resolve({ data: [] as any[] }),
        classIds.length ? supabase.from('sections').select('id, name, grade_id').in('id', classIds) : Promise.resolve({ data: [] as any[] }),
        supabase.from('grades').select('id, name').eq('institute_id', userInstituteId).limit(500),
        studentIds.length ? supabase.from('users').select('id, full_name').in('id', studentIds) : Promise.resolve({ data: [] as any[] }),
      ]);

      const gradeName: Record<string, string> = {};
      for (const g of (gradesRes.data || []) as any[]) gradeName[g.id] = g.name;

      const map: Record<string, { name: string; parent?: string }> = {};
      for (const c of (classesRes.data || []) as any[]) map[c.id] = { name: c.name };
      for (const s of (sectionsRes.data || []) as any[]) {
        map[s.id] = { name: s.name, parent: s.grade_id ? gradeName[s.grade_id] : undefined };
      }
      setClassNameById(map);

      const stuMap: Record<string, string> = {};
      for (const u of (usersRes.data || []) as any[]) stuMap[u.id] = u.full_name || 'طالب';
      setStudentNameById(stuMap);
    } catch (err: any) {
      if (!silent) Alert.alert('خطأ', err?.message || 'فشل تحميل الحضور');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [userInstituteId]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s while screen is open
  useEffect(() => {
    if (!userInstituteId) return;
    const t = setInterval(() => load(true), 30_000);
    return () => clearInterval(t);
  }, [userInstituteId, load]);

  // Realtime — refresh on any attendance change for this institute today
  useEffect(() => {
    if (!userInstituteId) return;
    const today = todayISO();
    const channel = supabase
      .channel(`att_live_${userInstituteId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance', filter: `institute_id=eq.${userInstituteId}` },
        (payload: any) => {
          const row = (payload.new || payload.old) as AttRow | undefined;
          if (!row || row.date !== today) return;
          load(true);
        }
      )
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [userInstituteId, load]);

  // Detect institute if not yet
  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) detectInstitute(userId);
  }, [userInstituteId, userId, isFetching, detectInstitute]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // Aggregate stats
  const stats = useMemo(() => {
    let present = 0, late = 0, absent = 0, excused = 0;
    const methodCounts: Record<string, number> = {};
    for (const r of rows) {
      if (r.status === 'present') present++;
      else if (r.status === 'late') late++;
      else if (r.status === 'absent') absent++;
      else if (r.status === 'excused') excused++;
      const m = (r.method || 'unknown').toLowerCase();
      methodCounts[m] = (methodCounts[m] || 0) + 1;
    }
    const total = rows.length;
    const attendedPct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { present, late, absent, excused, total, attendedPct, methodCounts };
  }, [rows]);

  // Group records by class_id with names + sorted by class label
  const groups = useMemo(() => {
    const m = new Map<string, ClassGroup>();
    for (const r of rows) {
      if (filter !== 'all' && r.status !== filter) continue;
      const cid = r.class_id || '__none__';
      const meta = classNameById[cid] || { name: cid === '__none__' ? 'بدون صف' : 'صف غير معروف' };
      let g = m.get(cid);
      if (!g) {
        g = { id: cid, name: meta.name, parentName: meta.parent, records: [], present: 0, late: 0, absent: 0, total: 0 };
        m.set(cid, g);
      }
      g.records.push({ ...r, studentName: studentNameById[r.student_id] || 'طالب', time: fmtTime(r.created_at) });
      g.total++;
      if (r.status === 'present') g.present++;
      else if (r.status === 'late') g.late++;
      else if (r.status === 'absent') g.absent++;
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [rows, classNameById, studentNameById, filter]);

  const toggleExpand = (id: string) => {
    haptics.selection();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const setFilterWithHaptic = (next: typeof filter) => {
    haptics.selection();
    setFilter(next);
  };

  const today = new Date();
  const dateLabel = today.toLocaleDateString('ar-IQ', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <View style={styles.root}>
      <RoleInnerHero
        title="الحضور المباشر"
        subtitle={dateLabel}
        gradient={dtokens.gradient.brand}
        right={
          <View style={styles.liveBadge}>
            <View style={styles.livePulse} />
            <Text style={styles.liveText}>مباشر</Text>
          </View>
        }
      />

      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <SkeletonList count={4} />
          ) : (
            <>
              {/* Hero stats card */}
              <FadeSlideIn delay={0}>
                <LinearGradient
                  colors={dtokens.gradient.brand as any}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.heroCard}
                >
                  <View style={styles.heroTop}>
                    <View>
                      <Text style={styles.heroLabel}>إجمالي التسجيلات اليوم</Text>
                      <Text style={styles.heroNumber}>{stats.total}</Text>
                    </View>
                    <View style={styles.heroPctWrap}>
                      <Text style={styles.heroPct}>{stats.attendedPct}%</Text>
                      <Text style={styles.heroPctLabel}>حضور</Text>
                    </View>
                  </View>

                  {/* Compact pill row */}
                  <View style={styles.heroPills}>
                    <View style={[styles.heroPill, { backgroundColor: 'rgba(16,185,129,0.22)' }]}>
                      <Ionicons name="checkmark-circle" size={14} color="#A7F3D0" />
                      <Text style={styles.heroPillText}>حاضر {stats.present}</Text>
                    </View>
                    <View style={[styles.heroPill, { backgroundColor: 'rgba(245,158,11,0.22)' }]}>
                      <Ionicons name="time" size={14} color="#FCD34D" />
                      <Text style={styles.heroPillText}>متأخر {stats.late}</Text>
                    </View>
                    <View style={[styles.heroPill, { backgroundColor: 'rgba(239,68,68,0.22)' }]}>
                      <Ionicons name="close-circle" size={14} color="#FCA5A5" />
                      <Text style={styles.heroPillText}>غائب {stats.absent}</Text>
                    </View>
                  </View>

                  {/* Method strip */}
                  {stats.total > 0 && (
                    <View style={styles.methodStrip}>
                      {Object.entries(stats.methodCounts).map(([key, n]) => {
                        const ml = methodLabel(key);
                        if (!ml) return null;
                        return (
                          <View key={key} style={styles.methodChip}>
                            <Ionicons name={ml.icon} size={12} color="#fff" />
                            <Text style={styles.methodText}>{ml.label} · {n}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </LinearGradient>
              </FadeSlideIn>

              {/* Filter chips */}
              <FadeSlideIn delay={60}>
                <View style={styles.filterRow}>
                  {([
                    { key: 'all',     label: `الكل (${stats.total})`, color: tokens.brand[500] },
                    { key: 'present', label: `حاضر (${stats.present})`, color: dtokens.color.success },
                    { key: 'late',    label: `متأخر (${stats.late})`, color: dtokens.color.warning },
                    { key: 'absent',  label: `غائب (${stats.absent})`, color: dtokens.color.danger },
                  ] as const).map(opt => {
                    const active = filter === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() => setFilterWithHaptic(opt.key)}
                        style={[
                          styles.filterChip,
                          active && { backgroundColor: opt.color, borderColor: opt.color },
                        ]}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.filterText, active && { color: '#fff' }]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </FadeSlideIn>

              <SectionLabel title="حسب الصف والشعبة" icon="layers" />

              {groups.length === 0 ? (
                <FadeSlideIn delay={120}>
                  <View style={styles.empty}>
                    <View style={styles.emptyIconWrap}>
                      <Ionicons name="finger-print" size={42} color={tokens.brand[500]} />
                    </View>
                    <Text style={styles.emptyTitle}>لم يُسجَّل حضور اليوم بعد</Text>
                    <Text style={styles.emptyBody}>
                      البيانات ستظهر هنا تلقائياً فور وصولها من جهاز البصمة أو من تسجيل QR / يدوي.
                    </Text>
                  </View>
                </FadeSlideIn>
              ) : (
                groups.map((g, idx) => {
                  const pct = g.total > 0 ? Math.round(((g.present + g.late) / g.total) * 100) : 0;
                  const isOpen = !!expanded[g.id];
                  return (
                    <FadeSlideIn key={g.id} delay={120 + idx * 30}>
                      <View style={styles.classCard}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => toggleExpand(g.id)}
                          style={styles.classHeader}
                        >
                          <View style={styles.classTitleWrap}>
                            <Text style={styles.className} numberOfLines={1}>{g.name}</Text>
                            {g.parentName ? (
                              <Text style={styles.classParent} numberOfLines={1}>{g.parentName}</Text>
                            ) : null}
                          </View>
                          <View style={styles.classRight}>
                            <Text style={styles.classCount}>{g.total}</Text>
                            <Ionicons
                              name={isOpen ? 'chevron-up' : 'chevron-down'}
                              size={18}
                              color={tokens.text[3]}
                            />
                          </View>
                        </TouchableOpacity>

                        <View style={styles.classMetrics}>
                          <View style={styles.metric}>
                            <View style={[styles.metricDot, { backgroundColor: dtokens.color.success }]} />
                            <Text style={styles.metricText}>حاضر {g.present}</Text>
                          </View>
                          <View style={styles.metric}>
                            <View style={[styles.metricDot, { backgroundColor: dtokens.color.warning }]} />
                            <Text style={styles.metricText}>متأخر {g.late}</Text>
                          </View>
                          <View style={styles.metric}>
                            <View style={[styles.metricDot, { backgroundColor: dtokens.color.danger }]} />
                            <Text style={styles.metricText}>غائب {g.absent}</Text>
                          </View>
                          <View style={[styles.metric, { marginInlineStart: 'auto' as any }]}>
                            <Text style={styles.metricPct}>{pct}%</Text>
                          </View>
                        </View>

                        <View style={styles.progressTrack}>
                          <View style={[styles.progressFill, { width: `${pct}%` }]} />
                        </View>

                        {isOpen && (
                          <View style={styles.studentList}>
                            {g.records.map(r => {
                              const v = statusVisual(r.status);
                              const ml = methodLabel(r.method);
                              return (
                                <View key={r.id} style={styles.studentRow}>
                                  <View style={[styles.statusBadge, { backgroundColor: v.bg }]}>
                                    <Ionicons name={v.icon} size={14} color={v.color} />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.studentName} numberOfLines={1}>{r.studentName}</Text>
                                    <View style={styles.studentMeta}>
                                      <Text style={[styles.studentStatus, { color: v.color }]}>{v.label}</Text>
                                      <Text style={styles.studentTime}>· {r.time}</Text>
                                      {ml && (
                                        <View style={styles.methodTag}>
                                          <Ionicons name={ml.icon} size={10} color={tokens.text[3]} />
                                          <Text style={styles.methodTagText}>{ml.label}</Text>
                                        </View>
                                      )}
                                    </View>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    </FadeSlideIn>
                  );
                })
              )}

              <View style={{ height: 16 }} />
              <Text style={styles.footnote}>
                {refreshing ? 'يُحدَّث الآن…' : 'يُحدَّث تلقائياً عند تسجيل أي بصمة جديدة'}
              </Text>
              <View style={{ height: 28 }} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.surface.bg },
  safe: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 },

  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)',
  },
  livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  liveText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Hero
  heroCard: {
    borderRadius: 22, padding: 18, marginBottom: 14,
    ...tokens.shadow.broadcast,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  heroLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '600' },
  heroNumber: { color: '#fff', fontSize: 38, fontWeight: '900', marginTop: 4, letterSpacing: -1 },
  heroPctWrap: { alignItems: 'flex-end' },
  heroPct: { color: '#fff', fontSize: 26, fontWeight: '900' },
  heroPctLabel: { color: 'rgba(255,255,255,0.68)', fontSize: 11, fontWeight: '700' },

  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  heroPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  methodStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  methodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  methodText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },

  // Filter chips
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: tokens.border[1], backgroundColor: tokens.surface.surface,
  },
  filterText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },

  // Class card
  classCard: {
    backgroundColor: tokens.surface.surface,
    borderRadius: 18, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: tokens.border[2],
    ...tokens.shadow.xs,
  },
  classHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  classTitleWrap: { flex: 1, marginInlineEnd: 10 as any },
  className: { fontSize: 15, fontWeight: '900', color: tokens.text[1], textAlign: 'right' },
  classParent: { fontSize: 11, color: tokens.text[3], textAlign: 'right', marginTop: 2 },
  classRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  classCount: {
    fontSize: 13, fontWeight: '900', color: tokens.brand[500],
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, backgroundColor: tokens.brand[100], minWidth: 28, textAlign: 'center',
  },

  classMetrics: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    gap: 12, marginTop: 10,
  },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metricDot: { width: 7, height: 7, borderRadius: 4 },
  metricText: { fontSize: 11.5, fontWeight: '700', color: tokens.text[2] },
  metricPct: { fontSize: 12, fontWeight: '900', color: tokens.text[1] },

  progressTrack: {
    height: 6, borderRadius: 3, backgroundColor: tokens.border[2],
    marginTop: 10, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: dtokens.color.success, borderRadius: 3 },

  studentList: { marginTop: 12, gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: tokens.border[2] },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusBadge: {
    width: 30, height: 30, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  studentName: { fontSize: 13, fontWeight: '700', color: tokens.text[1], textAlign: 'right' },
  studentMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  studentStatus: { fontSize: 11, fontWeight: '700' },
  studentTime: { fontSize: 11, color: tokens.text[3] },
  methodTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    backgroundColor: tokens.surface.surface2, marginInlineStart: 4 as any,
  },
  methodTagText: { fontSize: 10, color: tokens.text[3], fontWeight: '700' },

  // Empty
  empty: {
    backgroundColor: tokens.surface.surface, borderRadius: 22,
    padding: 26, alignItems: 'center',
    borderWidth: 1, borderColor: tokens.border[2],
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  emptyTitle: { fontSize: 15, fontWeight: '900', color: tokens.text[1], marginBottom: 6, textAlign: 'center' },
  emptyBody: { fontSize: 12.5, color: tokens.text[3], textAlign: 'center', lineHeight: 20 },

  footnote: { textAlign: 'center', fontSize: 11, color: tokens.text[3], fontStyle: 'italic' },
});
