// academic-calendar — institute admin academic calendar.
//
// Built fully inline: month navigator + day-grid + event list + edit/create
// sheet. No third-party calendar / date-picker libraries — uses native Date
// only (the user explicitly forbade new packages).
//
// Multi-tenant: every read & write hands the resolved userInstituteId to the
// service. On upsert we re-stamp institute_id from state (never trust the
// initial row to preserve isolation).
//
// RTL: row-reverse layouts; text alignment "right" where text is mixed with
// chrome; the day-grid follows the Gregorian week (Sun..Sat by default).

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, TouchableOpacity, TextInput, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import RoleInnerHero from '../../components/shared/RoleInnerHero';
import KeyboardAwareScroll from '../../components/shared/KeyboardAwareScroll';
import SectionLabel from '../../components/institute/SectionLabel';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import FadeSlideIn from '../../components/animated/FadeSlideIn';

import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { haptics } from '../../utils/haptics';
import { confirmAlert, errorAlert, successAlert } from '../../utils/alerts';

import {
  listCalendarEvents, upsertCalendarEvent, deleteCalendarEvent,
  type CalendarEvent, type CalendarCategory,
} from '../../services/instituteAdminService';

// ─────────── constants ───────────

const WEEKDAYS_AR = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
const MONTHS_AR = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
];

// Per-category color palette — matches the spec exactly.
const CATEGORY_COLOR: Record<CalendarCategory, { fg: string; bg: string; label: string }> = {
  holiday:    { fg: tokens.semantic.danger,  bg: tokens.semantic.dangerBg,  label: 'عطلة' },
  exam:       { fg: tokens.semantic.purple,  bg: tokens.semantic.purpleBg,  label: 'امتحان' },
  conference: { fg: tokens.semantic.teal,    bg: tokens.semantic.tealBg,    label: 'مؤتمر' },
  meeting:    { fg: tokens.semantic.info,    bg: tokens.semantic.infoBg,    label: 'اجتماع' },
  event:      { fg: tokens.semantic.orange,  bg: tokens.semantic.orangeBg,  label: 'مناسبة' },
  general:    { fg: tokens.text[3],          bg: tokens.border[1],          label: 'عام' },
};

const CATEGORY_OPTIONS: CalendarCategory[] = ['holiday', 'exam', 'conference', 'meeting', 'event', 'general'];

const AUDIENCE_OPTIONS: { key: string; label: string }[] = [
  { key: 'students', label: 'الطلاب' },
  { key: 'teachers', label: 'الأساتذة' },
  { key: 'parents',  label: 'أولياء الأمور' },
  { key: 'all',      label: 'الجميع' },
];

const COLOR_SWATCHES = [
  '#DC2626', // red
  '#7C3AED', // purple
  '#0D9488', // teal
  '#0284C7', // blue
  '#EA580C', // orange
  '#059669', // green
];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// ─────────── date helpers (no libs) ───────────

function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseIso(s: string): Date | null {
  if (!s || !DATE_REGEX.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function startOfMonth(year: number, month0: number): Date {
  return new Date(year, month0, 1);
}

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatRange(startStr: string, endStr: string): string {
  const a = parseIso(startStr);
  const b = parseIso(endStr);
  if (!a) return startStr;
  if (!b || sameDay(a, b)) return startStr;
  return `${startStr}  ←  ${endStr}`;
}

// ─────────── screen ───────────

export default function AcademicCalendar() {
  const { userId } = useAuthStore();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();

  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth()); // 0-11

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const [showSheet, setShowSheet] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  // ─────────── data load ───────────

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    // Fetch events whose range overlaps the visible month. The service uses
    // `start_date >= from` and `end_date <= to` — that misses multi-day events
    // that straddle the boundary, but matches the service signature exactly.
    // We pad by ±60 days to catch most overlap cases without a wider service.
    const fromDate = new Date(year, month, 1);
    fromDate.setDate(fromDate.getDate() - 60);
    const toDate = new Date(year, month + 1, 0);
    toDate.setDate(toDate.getDate() + 60);
    try {
      const list = await listCalendarEvents(
        userInstituteId,
        toIsoDate(fromDate),
        toIsoDate(toDate),
      );
      setEvents(list);
    } catch (err) {
      if (__DEV__) console.error('calendar load', err);
      errorAlert('خطأ', 'تعذّر تحميل التقويم.');
    } finally {
      setLoading(false);
    }
  }, [userInstituteId, year, month]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) detectInstitute(userId);
  }, [userInstituteId, userId, isFetching, detectInstitute]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // ─────────── derived: events in current month, by day ───────────

  // Map of `YYYY-MM-DD` → list of events touching that day.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const a = parseIso(ev.start_date);
      const b = parseIso(ev.end_date) || a;
      if (!a || !b) continue;
      // Walk each day in the event's range — small ranges so this is cheap.
      const cur = new Date(a);
      // Hard cap at 366 iterations to defend against bad data.
      for (let i = 0; i < 366 && cur <= b; i++) {
        const key = toIsoDate(cur);
        const arr = map.get(key) || [];
        arr.push(ev);
        map.set(key, arr);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [events]);

  // Events whose range overlaps the current visible month — for the list.
  const eventsThisMonth = useMemo(() => {
    const monthStart = toIsoDate(startOfMonth(year, month));
    const monthEnd = toIsoDate(new Date(year, month + 1, 0));
    const list = events.filter((ev) => {
      // overlap: !(ev.end < monthStart || ev.start > monthEnd)
      return !(ev.end_date < monthStart || ev.start_date > monthEnd);
    });
    return list.sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [events, year, month]);

  // ─────────── handlers ───────────

  const goPrev = () => {
    haptics.selection();
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const goNext = () => {
    haptics.selection();
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const goToday = () => {
    haptics.selection();
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const openNew = (preset?: string) => {
    haptics.light();
    setEditing(null);
    if (preset) {
      setEditing({
        id: '', institute_id: '', title: '', description: null,
        category: 'general',
        start_date: preset, end_date: preset,
        all_day: true, start_time: null, end_time: null,
        color: null, audience: [], created_by: null,
        created_at: '',
      } as CalendarEvent);
    }
    setShowSheet(true);
  };

  const openEdit = (ev: CalendarEvent) => {
    haptics.light();
    setEditing(ev);
    setShowSheet(true);
  };

  const handleDelete = (ev: CalendarEvent) => {
    confirmAlert(
      'حذف الحدث',
      `هل تريد حذف "${ev.title}"؟`,
      async () => {
        try {
          await deleteCalendarEvent(ev.id);
          setShowSheet(false);
          setEditing(null);
          await load();
          successAlert('تم', 'تم حذف الحدث.');
        } catch (err: any) {
          errorAlert('خطأ', err?.message || 'تعذّر الحذف.');
        }
      },
      true,
    );
  };

  // ─────────── render ───────────

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
        title="التقويم الدراسي"
        subtitle="العطل والامتحانات والمناسبات"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(47,47,186,0.30)"
      />

      {loading ? (
        <ActivityIndicator color={tokens.brand[500]} style={{ marginTop: 60 }} />
      ) : (
        <KeyboardAwareScroll
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
          }
        >
          {/* Month navigator */}
          <View style={styles.navRow}>
            <TouchableOpacity onPress={goNext} style={styles.navBtn} activeOpacity={0.85}>
              <Ionicons name="chevron-back" size={20} color={tokens.text[1]} />
              <Text style={styles.navBtnText}>التالي</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={goToday} activeOpacity={0.85} style={styles.navTitleWrap}>
              <Text style={styles.navTitle}>{MONTHS_AR[month]} {year}</Text>
              <Text style={styles.navTitleHint}>اضغط للعودة للشهر الحالي</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={goPrev} style={styles.navBtn} activeOpacity={0.85}>
              <Text style={styles.navBtnText}>السابق</Text>
              <Ionicons name="chevron-forward" size={20} color={tokens.text[1]} />
            </TouchableOpacity>
          </View>

          {/* Month grid */}
          <MonthGrid
            year={year}
            month={month}
            today={today}
            eventsByDay={eventsByDay}
            onPick={(iso) => openNew(iso)}
          />

          {/* Add button */}
          <TouchableOpacity style={styles.addBtn} activeOpacity={0.9} onPress={() => openNew()}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>إضافة حدث</Text>
          </TouchableOpacity>

          <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
            <SectionLabel
              title={`أحداث ${MONTHS_AR[month]} ${year}`}
              icon="list-outline"
            />
          </View>

          {eventsThisMonth.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="calendar-outline" size={36} color={tokens.brand[500]} />
              </View>
              <Text style={styles.emptyTitle}>لا أحداث في هذا الشهر</Text>
              <Text style={styles.emptyHint}>اضغط "إضافة حدث" أو اختر يوماً من التقويم.</Text>
            </View>
          ) : (
            eventsThisMonth.map((ev, i) => (
              <FadeSlideIn key={ev.id} delay={Math.min(i * 25, 300)} translateFrom={8}>
                <EventCard ev={ev} onPress={() => openEdit(ev)} />
              </FadeSlideIn>
            ))
          )}
        </KeyboardAwareScroll>
      )}

      <EventFormSheet
        visible={showSheet}
        instituteId={userInstituteId}
        initial={editing}
        onClose={() => { setShowSheet(false); setEditing(null); }}
        onSaved={async () => {
          setShowSheet(false);
          setEditing(null);
          await load();
        }}
        onDelete={editing && editing.id ? () => handleDelete(editing) : undefined}
      />
    </SafeAreaView>
  );
}

// ─────────── Month grid ───────────

function MonthGrid({
  year, month, today, eventsByDay, onPick,
}: {
  year: number;
  month: number;
  today: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  onPick: (iso: string) => void;
}) {
  const firstDay = startOfMonth(year, month).getDay(); // 0=Sun .. 6=Sat
  const numDays = daysInMonth(year, month);

  // Build a flat array of cells; null for leading/trailing pads.
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= numDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={gridStyles.wrap}>
      {/* Weekday header */}
      <View style={gridStyles.weekRow}>
        {WEEKDAYS_AR.map((wd) => (
          <View key={wd} style={gridStyles.weekCell}>
            <Text style={gridStyles.weekText}>{wd}</Text>
          </View>
        ))}
      </View>
      {/* Day cells */}
      <View style={gridStyles.daysGrid}>
        {cells.map((d, idx) => {
          if (d === null) {
            return <View key={`pad-${idx}`} style={gridStyles.dayCell} />;
          }
          const iso = `${year}-${pad2(month + 1)}-${pad2(d)}`;
          const cellDate = new Date(year, month, d);
          const isToday = sameDay(cellDate, today);
          const dayEvents = eventsByDay.get(iso) || [];
          // Pick up to 4 distinct category colors for dots.
          const seen = new Set<string>();
          const dots: string[] = [];
          for (const ev of dayEvents) {
            const c = ev.color || CATEGORY_COLOR[ev.category]?.fg || tokens.text[3];
            if (!seen.has(c)) { seen.add(c); dots.push(c); }
            if (dots.length >= 4) break;
          }
          return (
            <TouchableOpacity
              key={iso}
              style={[
                gridStyles.dayCell,
                isToday && gridStyles.dayCellToday,
                dayEvents.length > 0 && gridStyles.dayCellHasEvents,
              ]}
              onPress={() => onPick(iso)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  gridStyles.dayText,
                  isToday && gridStyles.dayTextToday,
                ]}
              >
                {d}
              </Text>
              {dots.length > 0 ? (
                <View style={gridStyles.dotsRow}>
                  {dots.map((c, i) => (
                    <View
                      key={`${iso}-${i}`}
                      style={[gridStyles.dot, { backgroundColor: c }]}
                    />
                  ))}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─────────── Event card ───────────

function EventCard({ ev, onPress }: { ev: CalendarEvent; onPress: () => void }) {
  const palette = CATEGORY_COLOR[ev.category] || CATEGORY_COLOR.general;
  const accent = ev.color || palette.fg;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.eventCard, { borderRightColor: accent, borderRightWidth: 4 }]}
    >
      <View style={styles.eventTop}>
        <View style={[styles.catBadge, { backgroundColor: palette.bg }]}>
          <Text style={[styles.catBadgeText, { color: palette.fg }]}>
            {palette.label}
          </Text>
        </View>
        <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
      </View>

      <View style={styles.eventMetaRow}>
        <Ionicons name="calendar-outline" size={13} color={tokens.text[3]} />
        <Text style={styles.eventMetaText}>
          {formatRange(ev.start_date, ev.end_date)}
        </Text>
        {!ev.all_day && ev.start_time ? (
          <>
            <Ionicons name="time-outline" size={13} color={tokens.text[3]} style={{ marginRight: 8 }} />
            <Text style={styles.eventMetaText}>
              {ev.start_time}{ev.end_time ? ` — ${ev.end_time}` : ''}
            </Text>
          </>
        ) : null}
      </View>

      {ev.audience && ev.audience.length > 0 ? (
        <View style={styles.audienceRow}>
          {ev.audience.map((a) => (
            <View key={a} style={styles.audiencePill}>
              <Text style={styles.audiencePillText}>
                {AUDIENCE_OPTIONS.find((o) => o.key === a)?.label || a}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {ev.description ? (
        <Text style={styles.eventDesc} numberOfLines={2}>{ev.description}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ─────────── Event form sheet ───────────

function EventFormSheet({
  visible, instituteId, initial, onClose, onSaved, onDelete,
}: {
  visible: boolean;
  instituteId: string;
  initial: CalendarEvent | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CalendarCategory>('general');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [audience, setAudience] = useState<string[]>([]);
  const [color, setColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isExisting = !!(initial && initial.id);

  useEffect(() => {
    if (!visible) return;
    if (initial) {
      setTitle(initial.title || '');
      setDescription(initial.description || '');
      setCategory(initial.category || 'general');
      setStartDate(initial.start_date || '');
      setEndDate(initial.end_date || initial.start_date || '');
      setAllDay(initial.all_day !== false);
      setStartTime(initial.start_time || '');
      setEndTime(initial.end_time || '');
      setAudience(Array.isArray(initial.audience) ? initial.audience : []);
      setColor(initial.color || null);
    } else {
      const todayIso = toIsoDate(new Date());
      setTitle(''); setDescription('');
      setCategory('general');
      setStartDate(todayIso); setEndDate(todayIso);
      setAllDay(true);
      setStartTime(''); setEndTime('');
      setAudience([]); setColor(null);
    }
  }, [visible, initial]);

  const toggleAudience = (key: string) => {
    haptics.selection();
    setAudience((prev) => {
      // "الجميع" is mutually exclusive with the specific picks.
      if (key === 'all') {
        return prev.includes('all') ? [] : ['all'];
      }
      const without = prev.filter((p) => p !== 'all' && p !== key);
      if (prev.includes(key)) return without;
      return [...without, key];
    });
  };

  const save = async () => {
    const t = title.trim();
    if (!t) { errorAlert('تنبيه', 'عنوان الحدث مطلوب.'); return; }
    if (!DATE_REGEX.test(startDate)) { errorAlert('تنبيه', 'تاريخ البداية غير صالح.'); return; }
    if (!DATE_REGEX.test(endDate))   { errorAlert('تنبيه', 'تاريخ النهاية غير صالح.'); return; }
    if (endDate < startDate) {
      errorAlert('تنبيه', 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية أو يساويه.');
      return;
    }
    if (!allDay) {
      if (startTime && !TIME_REGEX.test(startTime)) {
        errorAlert('تنبيه', 'وقت البداية غير صالح (HH:MM).'); return;
      }
      if (endTime && !TIME_REGEX.test(endTime)) {
        errorAlert('تنبيه', 'وقت النهاية غير صالح (HH:MM).'); return;
      }
    }
    setSaving(true);
    try {
      await upsertCalendarEvent({
        // Only pass id when it's a real existing event — the synthetic preset
        // row from clicking a grid day has id === '' which would break update.
        id: isExisting ? initial!.id : undefined,
        institute_id: instituteId,
        title: t,
        description: description.trim() || null,
        category,
        start_date: startDate,
        end_date: endDate,
        all_day: allDay,
        start_time: allDay ? null : (startTime.trim() || null),
        end_time:   allDay ? null : (endTime.trim() || null),
        audience,
        color: color || null,
      });
      successAlert('تم', isExisting ? 'تم تحديث الحدث.' : 'تم إنشاء الحدث.', onSaved);
    } catch (err: any) {
      errorAlert('خطأ', err?.message || 'تعذّر الحفظ.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.92}>
      <View style={sheetStyles.header}>
        <TouchableOpacity onPress={onClose} style={sheetStyles.iconBtn}>
          <Ionicons name="close" size={22} color={tokens.text[2]} />
        </TouchableOpacity>
        <Text style={sheetStyles.title}>
          {isExisting ? 'تعديل حدث' : 'إضافة حدث'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={sheetStyles.body} keyboardShouldPersistTaps="handled">
        <Field label="العنوان *">
          <TextInput
            value={title} onChangeText={setTitle}
            placeholder="مثال: عطلة عيد الأضحى"
            placeholderTextColor={tokens.text[4]}
            style={sheetStyles.input} textAlign="right"
          />
        </Field>

        <Field label="الوصف">
          <TextInput
            value={description} onChangeText={setDescription}
            placeholder="—"
            placeholderTextColor={tokens.text[4]}
            style={[sheetStyles.input, { minHeight: 60, textAlignVertical: 'top' }]}
            textAlign="right"
            multiline
          />
        </Field>

        <Field label="التصنيف">
          <View style={sheetStyles.chipsRow}>
            {CATEGORY_OPTIONS.map((c) => {
              const active = category === c;
              const palette = CATEGORY_COLOR[c];
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => { haptics.selection(); setCategory(c); }}
                  style={[
                    sheetStyles.smallChip,
                    active && { backgroundColor: palette.fg, borderColor: palette.fg },
                  ]}
                  activeOpacity={0.85}
                >
                  <Text style={[sheetStyles.smallChipText, active && { color: '#fff' }]}>
                    {palette.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        <View style={sheetStyles.twoCol}>
          <Field label="تاريخ البداية *" style={sheetStyles.colHalf}>
            <TextInput
              value={startDate} onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={tokens.text[4]}
              style={sheetStyles.input} textAlign="center"
            />
          </Field>
          <Field label="تاريخ النهاية *" style={sheetStyles.colHalf}>
            <TextInput
              value={endDate} onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={tokens.text[4]}
              style={sheetStyles.input} textAlign="center"
            />
          </Field>
        </View>

        <View style={sheetStyles.switchRow}>
          <Switch value={allDay} onValueChange={(v) => { haptics.selection(); setAllDay(v); }} />
          <Text style={sheetStyles.switchLabel}>طوال اليوم</Text>
        </View>

        {!allDay ? (
          <View style={sheetStyles.twoCol}>
            <Field label="وقت البداية" style={sheetStyles.colHalf}>
              <TextInput
                value={startTime} onChangeText={setStartTime}
                placeholder="08:00"
                placeholderTextColor={tokens.text[4]}
                style={sheetStyles.input} textAlign="center"
              />
            </Field>
            <Field label="وقت النهاية" style={sheetStyles.colHalf}>
              <TextInput
                value={endTime} onChangeText={setEndTime}
                placeholder="14:00"
                placeholderTextColor={tokens.text[4]}
                style={sheetStyles.input} textAlign="center"
              />
            </Field>
          </View>
        ) : null}

        <Field label="الفئة المستهدفة">
          <View style={sheetStyles.chipsRow}>
            {AUDIENCE_OPTIONS.map((opt) => {
              const active = audience.includes(opt.key);
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => toggleAudience(opt.key)}
                  style={[sheetStyles.smallChip, active && sheetStyles.smallChipActive]}
                  activeOpacity={0.85}
                >
                  {active ? (
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  ) : null}
                  <Text style={[
                    sheetStyles.smallChipText,
                    active && sheetStyles.smallChipTextActive,
                    active && { marginRight: 4 },
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        <Field label="لون مخصص (اختياري)">
          <View style={sheetStyles.swatchRow}>
            <TouchableOpacity
              onPress={() => { haptics.selection(); setColor(null); }}
              style={[sheetStyles.swatchOff, color === null && sheetStyles.swatchOn]}
              activeOpacity={0.85}
            >
              <Ionicons name="close" size={14} color={tokens.text[3]} />
            </TouchableOpacity>
            {COLOR_SWATCHES.map((c) => {
              const active = color === c;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => { haptics.selection(); setColor(c); }}
                  style={[
                    sheetStyles.swatch,
                    { backgroundColor: c },
                    active && sheetStyles.swatchOn,
                  ]}
                  activeOpacity={0.85}
                />
              );
            })}
          </View>
        </Field>

        <TouchableOpacity
          style={[sheetStyles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
          activeOpacity={0.9}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={sheetStyles.saveBtnText}>
                  {isExisting ? 'تحديث' : 'حفظ'}
                </Text>
              </>
          }
        </TouchableOpacity>

        {isExisting && onDelete ? (
          <TouchableOpacity
            style={sheetStyles.deleteBtn}
            onPress={onDelete}
            activeOpacity={0.85}
          >
            <Ionicons name="trash-outline" size={16} color={tokens.semantic.danger} />
            <Text style={sheetStyles.deleteBtnText}>حذف الحدث</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SwipeableSheet>
  );
}

// ─────────── Field helper ───────────

function Field({
  label, children, style,
}: {
  label: string;
  children: React.ReactNode;
  style?: any;
}) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={sheetStyles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ─────────── styles ───────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 13, color: tokens.text[3], fontWeight: '500' },

  // Month navigator — note: row (NOT row-reverse) because we hand-position
  // chevrons. "السابق" sits on the right, "التالي" on the left to match RTL
  // mental model: swipe right = older month.
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 8,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface,
    borderWidth: 1,
    borderColor: tokens.border[1],
  },
  navBtnText: { fontSize: 12, fontWeight: '700', color: tokens.text[1] },
  navTitleWrap: { alignItems: 'center', flex: 1 },
  navTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1] },
  navTitleHint: { fontSize: 10, color: tokens.text[4], fontWeight: '500', marginTop: 2 },

  // Add button
  addBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: tokens.brand[500],
    marginHorizontal: 16,
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
    marginVertical: 12,
    ...tokens.shadow.xs,
  },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Event card
  eventCard: {
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 14,
    marginVertical: 4,
    padding: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[2],
    gap: 6,
    ...tokens.shadow.xs,
  },
  eventTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  catBadgeText: { fontSize: 10, fontWeight: '800' },
  eventTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: tokens.text[1],
    textAlign: 'right',
  },
  eventMetaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  eventMetaText: {
    fontSize: 11,
    color: tokens.text[3],
    fontWeight: '600',
    marginRight: 4,
  },
  audienceRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 4,
  },
  audiencePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: tokens.brand[100],
  },
  audiencePillText: { fontSize: 10, fontWeight: '700', color: tokens.brand[500] },
  eventDesc: {
    fontSize: 12,
    color: tokens.text[2],
    textAlign: 'right',
    marginTop: 2,
  },

  // Empty state
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1] },
  emptyHint: { fontSize: 13, color: tokens.text[3], fontWeight: '500', textAlign: 'center', paddingHorizontal: 24 },
});

const gridStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 14,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.border[2],
    padding: 8,
    ...tokens.shadow.xs,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekText: {
    fontSize: 10,
    fontWeight: '800',
    color: tokens.text[3],
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  dayCellHasEvents: {
    // Subtle indicator on days with events (in addition to the dots).
    backgroundColor: tokens.surface.surface2,
    borderRadius: 10,
  },
  dayCellToday: {
    backgroundColor: tokens.brand[100],
    borderRadius: 10,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.text[1],
  },
  dayTextToday: {
    color: tokens.brand[500],
    fontWeight: '900',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});

const sheetStyles = StyleSheet.create({
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: tokens.surface.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 16, fontWeight: '800', color: tokens.text[1], textAlign: 'right',
  },
  body: { padding: 16, paddingTop: 8, gap: 4 },
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: tokens.text[2],
    textAlign: 'right', marginBottom: 6,
  },
  input: {
    backgroundColor: tokens.surface.surface2,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.border[1],
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: tokens.text[1],
  },
  twoCol: { flexDirection: 'row-reverse', gap: 10 },
  colHalf: { flex: 1 },
  chipsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  smallChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1, borderColor: tokens.border[1],
  },
  smallChipActive: {
    backgroundColor: tokens.brand[500],
    borderColor: tokens.brand[500],
  },
  smallChipText: { fontSize: 12, fontWeight: '700', color: tokens.text[2] },
  smallChipTextActive: { color: '#fff' },
  switchRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  switchLabel: { fontSize: 13, fontWeight: '600', color: tokens.text[1] },
  swatchRow: { flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' },
  swatch: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 2, borderColor: 'transparent',
  },
  swatchOff: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1, borderColor: tokens.border[1],
    alignItems: 'center', justifyContent: 'center',
  },
  swatchOn: {
    borderColor: tokens.text[1],
    borderWidth: 2,
  },
  saveBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: tokens.brand[500],
    paddingVertical: 13,
    borderRadius: tokens.radius.md,
    marginTop: 8,
    ...tokens.shadow.xs,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  deleteBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: tokens.semantic.dangerBg,
    paddingVertical: 11,
    borderRadius: tokens.radius.md,
    marginTop: 8,
  },
  deleteBtnText: { color: tokens.semantic.danger, fontWeight: '800', fontSize: 13 },
});
