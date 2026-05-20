// TeacherQuizCreateSheet — sheet لإضافة امتحان فصلي قصير.
// الأستاذ يختار الصف + المادة (اختياري) + التاريخ + الوقت + المدة + الموضوع.
// الإشعار للطلاب وأولياء الأمور يرسله DB trigger تلقائياً بعد الإدراج.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SwipeableSheet from '../../shared/SwipeableSheet';
import { tokens } from '../../../constants/designTokens';
import { Colors } from '../../../constants/colors';
import { haptics } from '../../../utils/haptics';
import { supabase } from '../../../services/supabase';
import { createTeacherQuiz, type TeacherQuiz } from '../../../services/examScheduleService';

type ClassOpt = { id: string; name: string };
type SubjectOpt = { id: string; name: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  teacherId: string;
  instituteId: string;
  onCreated?: (q: TeacherQuiz) => void;
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TeacherQuizCreateSheet({ visible, onClose, teacherId, instituteId, onCreated }: Props) {
  const [classes, setClasses] = useState<ClassOpt[]>([]);
  const [subjects, setSubjects] = useState<SubjectOpt[]>([]);
  const [loadingOpts, setLoadingOpts] = useState(false);

  const [classId, setClassId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState('30');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !teacherId) return;
    setLoadingOpts(true);
    (async () => {
      try {
        // Teacher's assigned classes (only what they can pick from)
        const { data: assigns } = await supabase
          .from('teacher_assignments')
          .select('class_id, subject_id, classes:class_id(id,name), subjects:subject_id(id,name)')
          .eq('teacher_id', teacherId);

        const classMap = new Map<string, ClassOpt>();
        const subjectMap = new Map<string, SubjectOpt>();
        for (const a of (assigns || []) as any[]) {
          if (a.classes?.id) classMap.set(a.classes.id, { id: a.classes.id, name: a.classes.name });
          if (a.subjects?.id) subjectMap.set(a.subjects.id, { id: a.subjects.id, name: a.subjects.name });
        }
        const classList = Array.from(classMap.values());
        const subjectList = Array.from(subjectMap.values());
        setClasses(classList);
        setSubjects(subjectList);
        if (classList.length === 1) setClassId(classList[0].id);
      } catch (e) {
        console.error('[QuizCreate] load opts', e);
      } finally {
        setLoadingOpts(false);
      }
    })();
  }, [visible, teacherId]);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setTopic('');
      setDate(todayISO());
      setTime('09:00');
      setDuration('30');
      setSubjectId(null);
    }
  }, [visible]);

  const canSave = useMemo(() => {
    return !!classId && !!title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(date)
      && /^\d{2}:\d{2}$/.test(time) && Number(duration) > 0;
  }, [classId, title, date, time, duration]);

  const handleSave = async () => {
    if (!canSave) {
      Alert.alert('تنبيه', 'اكمل بيانات الامتحان');
      return;
    }
    setSaving(true);
    try {
      const created = await createTeacherQuiz({
        institute_id: instituteId,
        teacher_id: teacherId,
        class_id: classId!,
        subject_id: subjectId,
        title: title.trim(),
        topic: topic.trim() || null,
        quiz_date: date,
        start_time: time.length === 5 ? `${time}:00` : time,
        duration_minutes: Number(duration),
      });
      haptics.success();
      onCreated?.(created);
      Alert.alert('تم', 'تم جدولة الامتحان وإرسال إشعار للطلاب وأولياء الأمور');
      onClose();
    } catch (e: any) {
      haptics.error();
      Alert.alert('خطأ', e?.message || 'فشل حفظ الامتحان');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.95} minHeight={0.75}>
      <View style={{ paddingHorizontal: 18, paddingBottom: 22, paddingTop: 4, flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="create" size={22} color="#0284C7" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: Colors.text, textAlign: 'right' }}>
              امتحان فصلي جديد
            </Text>
            <Text style={{ fontSize: 12, color: Colors.textSecondary, textAlign: 'right', marginTop: 2 }}>
              سيصل إشعار لطلاب الصف وأولياء أمورهم
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={20} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator>
          {loadingOpts ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 30 }} />
          ) : classes.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="warning-outline" size={28} color={Colors.warning} />
              <Text style={styles.emptyTitle}>ليس لديك صفوف مُسندة</Text>
              <Text style={styles.emptyHint}>
                راجع الإدارة لإسنادك إلى صف ومادة قبل إضافة الامتحانات.
              </Text>
            </View>
          ) : (
            <>
              {/* Class */}
              <Text style={styles.label}>الصف</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                {classes.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    active={classId === c.id}
                    onPress={() => { haptics.selection(); setClassId(c.id); }}
                  />
                ))}
              </ScrollView>

              {/* Subject (optional) */}
              {subjects.length > 0 && (
                <>
                  <Text style={[styles.label, { marginTop: 12 }]}>المادة (اختياري)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                    <Chip
                      label="—"
                      active={subjectId === null}
                      onPress={() => { haptics.selection(); setSubjectId(null); }}
                    />
                    {subjects.map((s) => (
                      <Chip
                        key={s.id}
                        label={s.name}
                        active={subjectId === s.id}
                        onPress={() => { haptics.selection(); setSubjectId(s.id); }}
                      />
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Title */}
              <Text style={[styles.label, { marginTop: 14 }]}>عنوان الامتحان</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="مثال: امتحان أسبوعي — الوحدة الثالثة"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
              />

              {/* Topic */}
              <Text style={[styles.label, { marginTop: 14 }]}>الموضوع / المنهج المشمول (اختياري)</Text>
              <TextInput
                value={topic}
                onChangeText={setTopic}
                placeholder="مثال: الفصول 4-6 / كل الوحدة الثالثة"
                placeholderTextColor={Colors.textMuted}
                style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]}
                multiline
              />

              {/* Date / Time / Duration */}
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>التاريخ</Text>
                  <TextInput value={date} onChangeText={setDate} placeholder="2026-05-20" placeholderTextColor={Colors.textMuted} style={styles.input} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>الوقت</Text>
                  <TextInput value={time} onChangeText={setTime} placeholder="09:00" placeholderTextColor={Colors.textMuted} style={styles.input} />
                </View>
                <View style={{ width: 80 }}>
                  <Text style={styles.label}>د المدة</Text>
                  <TextInput value={duration} onChangeText={setDuration} keyboardType="numeric" placeholder="30" placeholderTextColor={Colors.textMuted} style={styles.input} />
                </View>
              </View>

              {/* Save */}
              <TouchableOpacity
                onPress={handleSave}
                disabled={!canSave || saving}
                activeOpacity={0.85}
                style={[styles.saveBtn, (!canSave || saving) && { opacity: 0.5 }]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={styles.saveBtnText}>حفظ وإشعار</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </SwipeableSheet>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.chip, active && { backgroundColor: '#0284C7', borderColor: '#0284C7' }]}
    >
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = {
  label: { fontSize: 12, fontWeight: '800' as const, color: Colors.textSecondary, textAlign: 'right' as const, marginBottom: 6 },
  input: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, fontWeight: '600' as const, color: Colors.text, textAlign: 'right' as const,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: Colors.border,
  },
  chipText: { fontSize: 12, fontWeight: '700' as const, color: Colors.textSecondary },
  saveBtn: {
    flexDirection: 'row-reverse' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6,
    backgroundColor: '#0284C7', paddingVertical: 14, borderRadius: 14, marginTop: 18,
  },
  saveBtnText: { color: '#fff', fontWeight: '800' as const, fontSize: 14 },
  emptyBox: { paddingVertical: 24, alignItems: 'center' as const, gap: 8, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 14, fontWeight: '800' as const, color: Colors.text },
  emptyHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' as const, lineHeight: 18 },
};
