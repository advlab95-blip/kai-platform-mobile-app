import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SwipeableSheet from './SwipeableSheet';
import KeyboardAwareScroll from './KeyboardAwareScroll';
import { Colors } from '../../constants/colors';
import { api } from '../../services/api';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { haptics } from '../../utils/haptics';
import { successAlert } from '../../utils/alerts';

type Mode = 'announcement' | 'notification' | 'chat';
type Audience =
  | { kind: 'all_teachers' }
  | { kind: 'teacher_individual'; teacherId: string; label: string }
  | { kind: 'teachers_of_class'; classId: string; label: string }
  | { kind: 'all_students' }
  | { kind: 'students_of_class'; classId: string; label: string }
  | { kind: 'all_parents' }
  | { kind: 'parents_of_class'; classId: string; label: string }
  | { kind: 'parent_of_student'; studentId: string; label: string }
  | { kind: 'everyone' };

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function BroadcastHub({ visible, onClose }: Props) {
  const { userId, userName } = useAuthStore();
  const { userInstituteId } = useDataStore();

  const [step, setStep] = useState<'pick_mode' | 'compose'>('pick_mode');
  const [mode, setMode] = useState<Mode | null>(null);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [teacherPickerOpen, setTeacherPickerOpen] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    setStep('pick_mode');
    setMode(null);
    setAudience(null);
    setTitle('');
    setContent('');
  }, [visible]);

  useEffect(() => {
    if (!userInstituteId) return;
    (async () => {
      try {
        const cls = await api.getClassesByInstitute(userInstituteId);
        setClasses(cls || []);
      } catch {}
    })();
  }, [userInstituteId]);

  const pickMode = (m: Mode) => {
    haptics.light();
    setMode(m);
    if (m === 'announcement') {
      setAudience({ kind: 'everyone' });
    } else {
      setAudience(null);
    }
    setStep('compose');
  };

  const openClassPicker = async (forRole: 'teachers' | 'students' | 'parents') => {
    setClassPickerOpen(true);
    (openClassPicker as any)._for = forRole;
  };

  const pickClass = (cls: any) => {
    const forRole = (openClassPicker as any)._for as 'teachers' | 'students' | 'parents';
    setAudience(
      forRole === 'teachers'
        ? { kind: 'teachers_of_class', classId: cls.id, label: cls.name }
        : forRole === 'parents'
        ? { kind: 'parents_of_class', classId: cls.id, label: cls.name }
        : { kind: 'students_of_class', classId: cls.id, label: cls.name },
    );
    setClassPickerOpen(false);
  };

  const openStudentPicker = async (classId: string) => {
    if (!userInstituteId) return;
    setStudentPickerOpen(true);
    setStudents([]);
    try {
      const list = await api.getStudentsByClass(classId, userInstituteId);
      setStudents(list || []);
    } catch {}
  };

  const pickStudent = (st: any) => {
    setAudience({ kind: 'parent_of_student', studentId: st.id, label: st.full_name });
    setStudentPickerOpen(false);
  };

  const openTeacherPicker = async () => {
    if (!userInstituteId) return;
    setTeacherSearch('');
    setTeacherPickerOpen(true);
    if (teachers.length === 0) {
      try {
        const list = await api.getTeachersByInstitute(userInstituteId);
        setTeachers(list || []);
      } catch {}
    }
  };

  const pickTeacher = (t: any) => {
    setAudience({ kind: 'teacher_individual', teacherId: t.id, label: t.full_name || t.name || 'أستاذ' });
    setTeacherPickerOpen(false);
  };

  const resolveRecipients = async (): Promise<{ recipients?: string[]; role?: 'teacher' | 'student' | 'parent' | 'all' }> => {
    if (!audience || !userInstituteId) return {};
    switch (audience.kind) {
      case 'everyone':
        return { role: 'all' };
      case 'all_teachers':
        return { role: 'teacher' };
      case 'teacher_individual':
        return { recipients: [audience.teacherId] };
      case 'all_students':
        return { role: 'student' };
      case 'all_parents': {
        const parents = await api.getParentsByInstitute(userInstituteId);
        return { recipients: (parents || []).map((p: any) => p.id) };
      }
      case 'teachers_of_class': {
        const teachers = await api.getTeachersByClass(audience.classId, userInstituteId);
        return { recipients: teachers.map((t: any) => t.id) };
      }
      case 'students_of_class': {
        const students = await api.getStudentsByClass(audience.classId, userInstituteId);
        return { recipients: students.map((s: any) => s.id) };
      }
      case 'parents_of_class': {
        // Resolve students of the chosen class, then collect their parents.
        // Dedup by parent id since a parent may have multiple kids in the class.
        const students = await api.getStudentsByClass(audience.classId, userInstituteId);
        const parentLists = await Promise.all(
          (students || []).map((st: any) =>
            api.getParentsOfStudent(st.id, userInstituteId).catch(() => []),
          ),
        );
        const parentIds = Array.from(
          new Set(parentLists.flat().map((p: any) => p.id).filter(Boolean)),
        );
        return { recipients: parentIds };
      }
      case 'parent_of_student': {
        const parents = await api.getParentsOfStudent(audience.studentId, userInstituteId);
        return { recipients: parents.map((p: any) => p.id) };
      }
    }
  };

  const send = async () => {
    if (!userId || !userInstituteId || !mode || !audience) return;
    if (mode !== 'chat' && !title.trim()) return;
    if (!content.trim()) return;

    try {
      setLoading(true);
      haptics.medium();
      const { recipients, role } = await resolveRecipients();

      if (mode === 'chat' && (!recipients || recipients.length === 0)) {
        throw new Error('لا يوجد مستقبلون مطابقون للاختيار');
      }

      const result = await api.broadcastFromInstitute({
        mode,
        title: title.trim(),
        content: content.trim(),
        targetRole: role,
        recipients,
        instituteId: userInstituteId,
        senderId: userId,
        senderName: userName || 'الإدارة',
      });

      const label =
        mode === 'announcement' ? 'تم نشر الإعلان'
        : mode === 'notification' ? 'تم إرسال التبليغ'
        : 'تم إرسال الرسالة';
      const suffix =
        typeof result.delivered === 'number'
          ? ` (${result.delivered} مستقبل)`
          : ' (لكل المستهدفين)';
      successAlert(label, label + suffix);
      onClose();
    } catch (e: any) {
      successAlert('خطأ', e?.message || 'فشل الإرسال');
    } finally {
      setLoading(false);
    }
  };

  const audienceChoices = useMemo(() => {
    if (!mode) return [];
    const common = [
      { kind: 'all_teachers', label: 'كل الأساتذة', icon: 'school' as const },
      { kind: 'teacher_individual', label: 'أستاذ واحد', icon: 'person' as const },
      { kind: 'teachers_of_class', label: 'أساتذة صف معيّن', icon: 'folder-open' as const },
    ];
    if (mode === 'chat') {
      return [
        ...common,
        { kind: 'all_parents', label: 'كل أولياء الأمور', icon: 'people' as const },
        { kind: 'parents_of_class', label: 'أولياء أمور صف معيّن', icon: 'people-outline' as const },
        { kind: 'parent_of_student', label: 'ولي أمر طالب واحد', icon: 'person' as const },
      ];
    }
    if (mode === 'notification') {
      return [
        ...common,
        { kind: 'all_students', label: 'كل الطلاب', icon: 'people-circle' as const },
        { kind: 'students_of_class', label: 'طلاب صف معيّن', icon: 'albums' as const },
        { kind: 'all_parents', label: 'كل أولياء الأمور', icon: 'people' as const },
        { kind: 'parents_of_class', label: 'أولياء أمور صف معيّن', icon: 'people-outline' as const },
      ];
    }
    return [];
  }, [mode]);

  // Show only classes that actually have students enrolled.
  // Reason: empty classes are noise in pickers — admin asked us to hide them.
  const enrolledClasses = useMemo(
    () => (classes || []).filter((c: any) => Number(c.student_count ?? 0) > 0),
    [classes],
  );

  const modeMeta = {
    announcement: { title: 'إعلان', color: '#2563EB', icon: 'megaphone' as const, sub: 'يصل لكل المؤسسة' },
    notification: { title: 'تبليغ', color: '#F59E0B', icon: 'notifications' as const, sub: 'لأساتذة/طلاب صف معيّن' },
    chat: { title: 'محادثة', color: '#10B981', icon: 'chatbubbles' as const, sub: 'رسالة مباشرة مع رد' },
  } as const;

  const canSend =
    !!mode && !!audience && !!content.trim() && (mode === 'chat' || !!title.trim()) && !loading;

  return (
    <>
      <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.9}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <KeyboardAwareScroll
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {step === 'pick_mode' && (
              <View>
                <Text style={s.title}>ماذا تريد أن ترسل؟</Text>
                <Text style={s.subtitle}>اختر نوع الرسالة — لكل نوع استخدام مختلف.</Text>
                <View style={{ gap: 10, marginTop: 14 }}>
                  {(['announcement', 'notification', 'chat'] as Mode[]).map((m) => {
                    const meta = modeMeta[m];
                    return (
                      <TouchableOpacity
                        key={m}
                        style={s.modeCard}
                        onPress={() => pickMode(m)}
                        activeOpacity={0.85}
                      >
                        <View style={[s.modeIcon, { backgroundColor: meta.color }]}>
                          <Ionicons name={meta.icon} size={22} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.modeTitle}>{meta.title}</Text>
                          <Text style={s.modeSub}>{meta.sub}</Text>
                        </View>
                        <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {step === 'compose' && mode && (
              <View>
                <View style={s.composeHeader}>
                  <TouchableOpacity onPress={() => setStep('pick_mode')} style={s.backBtn}>
                    <Ionicons name="chevron-forward" size={20} color={Colors.text} />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>{modeMeta[mode].title}</Text>
                    <Text style={s.subtitle}>{modeMeta[mode].sub}</Text>
                  </View>
                  <View style={[s.modeIcon, { backgroundColor: modeMeta[mode].color }]}>
                    <Ionicons name={modeMeta[mode].icon} size={20} color="#fff" />
                  </View>
                </View>

                {mode !== 'announcement' && (
                  <View style={{ marginTop: 14 }}>
                    <Text style={s.label}>إلى من؟</Text>
                    <View style={s.audienceGrid}>
                      {audienceChoices.map((a) => {
                        const selected = audience?.kind === a.kind;
                        return (
                          <TouchableOpacity
                            key={a.kind}
                            style={[s.audienceChip, selected && s.audienceChipOn]}
                            onPress={() => {
                              haptics.light();
                              if (a.kind === 'teachers_of_class') {
                                openClassPicker('teachers');
                              } else if (a.kind === 'students_of_class') {
                                openClassPicker('students');
                              } else if (a.kind === 'parents_of_class') {
                                openClassPicker('parents');
                              } else if (a.kind === 'teacher_individual') {
                                openTeacherPicker();
                              } else if (a.kind === 'parent_of_student') {
                                setClassPickerOpen(true);
                                (openClassPicker as any)._for = 'students';
                                (openClassPicker as any)._thenStudent = true;
                              } else {
                                setAudience({ kind: a.kind as any });
                              }
                            }}
                          >
                            <Ionicons
                              name={a.icon}
                              size={14}
                              color={selected ? '#fff' : Colors.text}
                            />
                            <Text
                              style={[
                                s.audienceChipText,
                                selected && { color: '#fff' },
                              ]}
                              numberOfLines={1}
                            >
                              {a.label}
                              {selected && 'label' in (audience as any) &&
                                ` — ${(audience as any).label}`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {mode !== 'chat' && (
                  <View style={{ marginTop: 14 }}>
                    <Text style={s.label}>العنوان</Text>
                    <TextInput
                      value={title}
                      onChangeText={setTitle}
                      placeholder="اكتب عنواناً واضحاً…"
                      placeholderTextColor={Colors.textMuted}
                      style={s.input}
                      maxLength={120}
                    />
                  </View>
                )}

                <View style={{ marginTop: 14 }}>
                  <Text style={s.label}>المحتوى</Text>
                  <TextInput
                    value={content}
                    onChangeText={setContent}
                    placeholder="اكتب الرسالة…"
                    placeholderTextColor={Colors.textMuted}
                    style={[s.input, s.inputArea]}
                    multiline
                    maxLength={1500}
                  />
                </View>

                <TouchableOpacity
                  style={[s.sendBtn, !canSend && { opacity: 0.5 }]}
                  onPress={send}
                  disabled={!canSend}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="send" size={16} color="#fff" />
                      <Text style={s.sendBtnText}>
                        {mode === 'announcement' ? 'نشر الإعلان'
                          : mode === 'notification' ? 'إرسال التبليغ'
                          : 'إرسال الرسالة'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </KeyboardAwareScroll>
        </KeyboardAvoidingView>
      </SwipeableSheet>

      <SwipeableSheet
        visible={classPickerOpen}
        onClose={() => setClassPickerOpen(false)}
        maxHeight={0.7}
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          <Text style={s.title}>اختر الصف</Text>
          <Text style={s.subtitle}>تظهر فقط الصفوف اللي بيها طلاب مسجّلين.</Text>
          <ScrollView style={{ maxHeight: 420, marginTop: 10 }}>
            {enrolledClasses.length === 0 ? (
              <Text style={s.subtitle}>لا توجد صفوف بطلاب مسجّلين بعد</Text>
            ) : (
              enrolledClasses.map((c: any) => (
                <TouchableOpacity
                  key={c.id}
                  style={s.pickerRow}
                  onPress={() => {
                    if ((openClassPicker as any)._thenStudent) {
                      (openClassPicker as any)._thenStudent = false;
                      setClassPickerOpen(false);
                      setTimeout(() => openStudentPicker(c.id), 200);
                    } else {
                      pickClass(c);
                    }
                  }}
                >
                  <Ionicons name="folder" size={18} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.pickerRowText}>{c.name}</Text>
                    <Text style={s.pickerRowSub}>
                      {Number(c.student_count ?? 0)} طالب
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </SwipeableSheet>

      <SwipeableSheet
        visible={teacherPickerOpen}
        onClose={() => setTeacherPickerOpen(false)}
        maxHeight={0.75}
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          <Text style={s.title}>اختر الأستاذ</Text>
          <Text style={s.subtitle}>ابحث بالاسم لاختيار أستاذ واحد.</Text>
          <TextInput
            value={teacherSearch}
            onChangeText={setTeacherSearch}
            placeholder="بحث بالاسم…"
            placeholderTextColor={Colors.textMuted}
            style={[s.input, { marginTop: 10 }]}
          />
          <ScrollView style={{ maxHeight: 420, marginTop: 10 }} keyboardShouldPersistTaps="handled">
            {teachers.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : (
              teachers
                .filter((t: any) => {
                  const q = teacherSearch.trim().toLowerCase();
                  if (!q) return true;
                  const name = (t.full_name || t.name || '').toLowerCase();
                  return name.includes(q);
                })
                .map((t: any) => (
                  <TouchableOpacity
                    key={t.id}
                    style={s.pickerRow}
                    onPress={() => pickTeacher(t)}
                  >
                    <Ionicons name="school" size={18} color={Colors.primary} />
                    <Text style={s.pickerRowText}>{t.full_name || t.name}</Text>
                  </TouchableOpacity>
                ))
            )}
          </ScrollView>
        </View>
      </SwipeableSheet>

      <SwipeableSheet
        visible={studentPickerOpen}
        onClose={() => setStudentPickerOpen(false)}
        maxHeight={0.7}
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          <Text style={s.title}>اختر الطالب</Text>
          <ScrollView style={{ maxHeight: 420, marginTop: 10 }}>
            {students.length === 0 ? (
              <Text style={s.subtitle}>لا يوجد طلاب في هذا الصف</Text>
            ) : (
              students.map((st: any) => (
                <TouchableOpacity
                  key={st.id}
                  style={s.pickerRow}
                  onPress={() => pickStudent(st)}
                >
                  <Ionicons name="person" size={18} color={Colors.primary} />
                  <Text style={s.pickerRowText}>{st.full_name}</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </SwipeableSheet>
    </>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  subtitle: { fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginTop: 4 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.text, textAlign: 'right', marginBottom: 6 },
  modeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, padding: 12,
    borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0',
  },
  modeIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  modeTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  modeSub: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },
  composeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  audienceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  audienceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: '#F1F5F9', borderRadius: 12,
    maxWidth: '100%',
  },
  audienceChipOn: { backgroundColor: Colors.primary },
  audienceChipText: { fontSize: 12, fontWeight: '700', color: Colors.text },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: Colors.text, textAlign: 'right',
  },
  inputArea: { minHeight: 110, textAlignVertical: 'top' },
  sendBtn: {
    marginTop: 18,
    backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 14,
  },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  pickerRowText: { fontSize: 13, color: Colors.text, textAlign: 'right' },
  pickerRowSub: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },
});
