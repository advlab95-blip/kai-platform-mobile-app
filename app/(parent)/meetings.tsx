// ParentMeetings — parent-facing list of parent-teacher meetings the institute
// admin posted. Parent can RSVP attending/maybe/declined. The admin creates
// meetings from the institute panel (separate screen).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  ActivityIndicator, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useParentStore from '../../stores/parentStore';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SkeletonList from '../../components/shared/SkeletonList';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import {
  getMyParentMeetings, setMeetingRsvp,
  type ParentMeeting,
} from '../../services/parentService';

const RSVP_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  attending: { label: 'مؤكد الحضور', bg: tokens.semantic.successBg, fg: tokens.semantic.success },
  maybe:     { label: 'ربما',         bg: tokens.semantic.warningBg, fg: tokens.semantic.warning },
  declined:  { label: 'لن أحضر',      bg: tokens.semantic.dangerBg,  fg: tokens.semantic.danger },
};

export default function ParentMeetingsScreen() {
  const { userId } = useAuthStore();
  const { children } = useParentStore();
  const instituteIds = useMemo(
    () => Array.from(new Set(children.map((c: any) => c.instituteId).filter(Boolean))),
    [children],
  );

  const [meetings, setMeetings] = useState<ParentMeeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || instituteIds.length === 0) { setMeetings([]); return; }
    setLoading(true);
    try {
      const data = await getMyParentMeetings(userId, instituteIds);
      setMeetings(data);
    } catch (err) {
      if (__DEV__) console.error('[parent/meetings] load', err);
    } finally {
      setLoading(false);
    }
  }, [userId, instituteIds]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const handleRsvp = async (m: ParentMeeting, response: 'attending' | 'maybe' | 'declined') => {
    if (!userId) return;
    setBusyId(m.id);
    haptics.medium();
    try {
      await setMeetingRsvp(m.id, userId, response);
      setMeetings((prev) => prev.map((x) => x.id === m.id ? { ...x, my_rsvp: response } : x));
      haptics.success();
    } catch (err: any) {
      haptics.error();
      Alert.alert('خطأ', err?.message || 'فشل التسجيل');
    } finally {
      setBusyId(null);
    }
  };

  const openMeetingLink = async (url: string | null) => {
    if (!url) return;
    haptics.light();
    try { await Linking.openURL(url); } catch { /* silent */ }
  };

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const u: ParentMeeting[] = [];
    const p: ParentMeeting[] = [];
    for (const m of meetings) {
      if (new Date(m.scheduled_at).getTime() >= now) u.push(m);
      else p.push(m);
    }
    u.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    p.sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
    return { upcoming: u, past: p };
  }, [meetings]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="اجتماعات أولياء الأمور"
        subtitle="القادمة + سجل الماضي"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(124,58,237,0.30)"
        fallbackRoute="/(parent)/services"
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
        }
      >
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SkeletonList count={3} cardHeight={140} />
          </View>
        ) : meetings.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="people-outline" size={36} color={tokens.brand[500]} />
            </View>
            <Text style={styles.emptyTitle}>لا توجد اجتماعات</Text>
            <Text style={styles.emptyHint}>
              عند إعلان الإدارة عن اجتماع، سيظهر هنا
            </Text>
          </View>
        ) : (
          <View style={{ paddingTop: 8 }}>
            {upcoming.length > 0 && (
              <Section title="القادمة" data={upcoming} busyId={busyId} onRsvp={handleRsvp} onOpenLink={openMeetingLink} />
            )}
            {past.length > 0 && (
              <Section title="سابقة" data={past} busyId={null} onRsvp={() => {}} onOpenLink={openMeetingLink} muted />
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title, data, busyId, onRsvp, onOpenLink, muted,
}: {
  title: string;
  data: ParentMeeting[];
  busyId: string | null;
  onRsvp: (m: ParentMeeting, r: 'attending' | 'maybe' | 'declined') => void;
  onOpenLink: (url: string | null) => void;
  muted?: boolean;
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 10 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {data.map((m, idx) => {
        const rsvpSt = m.my_rsvp ? RSVP_STYLE[m.my_rsvp] : null;
        return (
          <FadeSlideIn key={m.id} delay={idx * 30} translateFrom={6}>
            <View style={[styles.card, muted && { opacity: 0.7 }]}>
              <View style={styles.cardHeader}>
                <Text style={styles.dateText}>{formatDateTime(m.scheduled_at)}</Text>
                {rsvpSt && (
                  <View style={[styles.chip, { backgroundColor: rsvpSt.bg }]}>
                    <Text style={[styles.chipText, { color: rsvpSt.fg }]}>{rsvpSt.label}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.titleText} numberOfLines={2}>{m.title}</Text>
              {m.agenda ? (
                <Text style={styles.agendaText} numberOfLines={4}>{m.agenda}</Text>
              ) : null}
              <View style={styles.metaRow}>
                {m.location ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={12} color={tokens.text[3]} />
                    <Text style={styles.metaText} numberOfLines={1}>{m.location}</Text>
                  </View>
                ) : null}
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={12} color={tokens.text[3]} />
                  <Text style={styles.metaText}>{m.duration_minutes} دقيقة</Text>
                </View>
              </View>

              {m.meeting_url && !muted && (
                <TouchableOpacity onPress={() => onOpenLink(m.meeting_url)}
                  style={styles.joinBtn} activeOpacity={0.85}>
                  <Ionicons name="videocam" size={16} color="#fff" />
                  <Text style={styles.joinBtnText}>الانضمام</Text>
                </TouchableOpacity>
              )}

              {!muted && (
                <View style={styles.rsvpRow}>
                  {(['attending', 'maybe', 'declined'] as const).map((r) => {
                    const active = m.my_rsvp === r;
                    const st = RSVP_STYLE[r];
                    return (
                      <TouchableOpacity key={r}
                        onPress={() => onRsvp(m, r)}
                        disabled={busyId === m.id}
                        activeOpacity={0.85}
                        style={[styles.rsvpBtn, active && { backgroundColor: st.bg, borderColor: st.fg }]}
                      >
                        {busyId === m.id && active ? (
                          <ActivityIndicator size="small" color={st.fg} />
                        ) : (
                          <Text style={[styles.rsvpText, active && { color: st.fg, fontWeight: '900' }]}>
                            {st.label}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </FadeSlideIn>
        );
      })}
    </View>
  );
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ar-IQ', {
      weekday: 'long', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: tokens.text[1], textAlign: 'right', marginTop: 8, marginBottom: 4 },
  card: {
    backgroundColor: tokens.surface.surface, borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.border[2], padding: 14, gap: 8,
    ...tokens.shadow.xs,
  },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  dateText: { fontSize: 12, fontWeight: '800', color: tokens.brand[500] },
  titleText: { fontSize: 15, fontWeight: '900', color: tokens.text[1], textAlign: 'right' },
  agendaText: { fontSize: 12, color: tokens.text[2], textAlign: 'right', lineHeight: 17 },
  metaRow: { flexDirection: 'row-reverse', gap: 12, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: tokens.text[3] },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 11, fontWeight: '700' },
  joinBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: tokens.radius.md,
    backgroundColor: tokens.brand[500],
  },
  joinBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  rsvpRow: { flexDirection: 'row-reverse', gap: 6, marginTop: 4 },
  rsvpBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface2, borderWidth: 1, borderColor: tokens.border[2],
  },
  rsvpText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
  emptyBox: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, gap: 12 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: tokens.brand[100], alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1], textAlign: 'center' },
  emptyHint: { fontSize: 13, color: tokens.text[3], textAlign: 'center' },
});
