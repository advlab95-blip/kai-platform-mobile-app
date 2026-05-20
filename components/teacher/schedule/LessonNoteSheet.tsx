// LessonNoteSheet — bottom sheet for adding/editing a per-lesson teacher note.
//
// Opens from (teacher)/schedule.tsx — typically via long-press or a "+ note"
// affordance on a timetable row. Persists to lesson_notes via the upsert
// helper, keyed by (timetable_id, lesson_date).
//
// We auto-load any existing note for the given (timetable, date) on open so
// the teacher can edit/extend it instead of overwriting it blind.

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SwipeableSheet from '../../shared/SwipeableSheet';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';
import {
  getLessonNote, upsertLessonNote, deleteLessonNote,
} from '../../../services/lessonNotesService';

type Props = {
  visible: boolean;
  onClose: () => void;
  instituteId: string;
  teacherId: string;
  timetableId: string;
  /** YYYY-MM-DD — the calendar date this lesson instance falls on. */
  lessonDate: string;
  /** Display info — shown in the header so the teacher knows which lesson
   *  they're noting. Optional because schedule.tsx already shows the row. */
  subject?: string | null;
  timeLabel?: string | null;
  onSaved?: () => void;
};

export default function LessonNoteSheet({
  visible, onClose, instituteId, teacherId, timetableId, lessonDate,
  subject, timeLabel, onSaved,
}: Props) {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setContent('');
    setNoteId(null);
    getLessonNote(timetableId, lessonDate)
      .then((row) => {
        if (cancelled) return;
        if (row) {
          setNoteId(row.id);
          setContent(row.content);
        }
      })
      .catch(() => { /* silent — new note flow if load fails */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, timetableId, lessonDate]);

  const handleSave = async () => {
    const trimmed = content.trim();
    if (trimmed.length < 1) {
      Alert.alert('تنبيه', 'الملاحظة فارغة');
      return;
    }
    if (trimmed.length > 4000) {
      Alert.alert('تنبيه', 'الملاحظة طويلة جداً (4000 حرف كحد أقصى)');
      return;
    }
    setSaving(true);
    haptics.medium();
    try {
      const saved = await upsertLessonNote({
        institute_id: instituteId,
        teacher_id: teacherId,
        timetable_id: timetableId,
        lesson_date: lessonDate,
        content: trimmed,
      });
      setNoteId(saved.id);
      haptics.success();
      onSaved?.();
      onClose();
    } catch (err: any) {
      haptics.error();
      Alert.alert('خطأ', err?.message || 'فشل حفظ الملاحظة');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!noteId) return;
    Alert.alert(
      'حذف الملاحظة',
      'هل تريد حذف هذه الملاحظة؟ لا يمكن التراجع.',
      [
        { text: 'تراجع', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteLessonNote(noteId);
              haptics.success();
              setNoteId(null);
              setContent('');
              onSaved?.();
              onClose();
            } catch (err: any) {
              haptics.error();
              Alert.alert('خطأ', err?.message || 'فشل الحذف');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.9}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="document-text-outline" size={20} color={tokens.color.brand500} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {noteId ? 'تعديل ملاحظة الدرس' : 'ملاحظة درس جديدة'}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subject ? `${subject} • ` : ''}{timeLabel ? `${timeLabel} • ` : ''}{lessonDate}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 40 }}>
            <ActivityIndicator color={tokens.color.brand500} />
          </View>
        ) : (
          <>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="ما الذي تم تغطيته؟ ما يحتاج متابعة؟ مهام للحصة القادمة..."
              placeholderTextColor={tokens.color.text4}
              style={styles.input}
              multiline
              textAlignVertical="top"
              textAlign="right"
              maxLength={4000}
              autoFocus={!noteId}
            />
            <Text style={styles.counter}>{content.length}/4000</Text>

            <View style={styles.actions}>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving || deleting}
                style={[styles.saveBtn, (saving || deleting) && styles.btnDisabled]}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Ionicons name="checkmark" size={18} color="#fff" />}
                <Text style={styles.saveBtnText}>
                  {saving ? 'جاري الحفظ...' : noteId ? 'حفظ التعديلات' : 'حفظ الملاحظة'}
                </Text>
              </TouchableOpacity>

              {noteId && (
                <TouchableOpacity
                  onPress={handleDelete}
                  disabled={saving || deleting}
                  style={styles.deleteBtn}
                  activeOpacity={0.85}
                >
                  {deleting
                    ? <ActivityIndicator color={tokens.color.danger} />
                    : <Ionicons name="trash-outline" size={18} color={tokens.color.danger} />}
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    gap: 12,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingTop: 6,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: tokens.color.brand100,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '900', color: tokens.color.text, textAlign: 'right' },
  subtitle: { fontSize: 11, color: tokens.color.text3, textAlign: 'right', marginTop: 2 },

  input: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: 12,
    fontSize: 14,
    color: tokens.color.text,
    minHeight: 160,
    textAlign: 'right',
  },
  counter: {
    fontSize: 11,
    color: tokens.color.text4,
    textAlign: 'left',
    marginTop: -8,
  },

  actions: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brand500,
  },
  btnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  deleteBtn: {
    width: 48,
    height: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.danger + '15',
    borderWidth: 1,
    borderColor: tokens.color.danger + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
