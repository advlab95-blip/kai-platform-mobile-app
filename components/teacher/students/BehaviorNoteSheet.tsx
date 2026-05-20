// BehaviorNoteSheet — teacher writes a behavior note on a specific student.
//
// Used from app/(teacher)/students.tsx (student detail screen). The note goes
// into the same `behavior_notes` table the institute admin reads from on
// (institute)/behavior-notes — so the teacher's observation surfaces there
// instantly without any extra plumbing.
//
// Multi-tenant: institute_id is stamped at insert time; the RLS on
// behavior_notes already restricts teachers to their own institute.
//
// Kept inside `components/teacher/students/` to mirror the project's
// per-screen-component convention.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  Alert, Platform, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SwipeableSheet from '../../shared/SwipeableSheet';
import { tokens } from '../../../constants/theme';
import { haptics } from '../../../utils/haptics';
import { addBehaviorNote } from '../../../services/instituteAdminService';

type Sentiment = 'positive' | 'neutral' | 'warning' | 'negative';

const SENTIMENT_OPTIONS: { key: Sentiment; label: string; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; bg: string; fg: string }[] = [
  { key: 'positive', label: 'إيجابية', icon: 'happy-outline',          bg: tokens.semantic.successBg, fg: tokens.semantic.success },
  { key: 'neutral',  label: 'محايدة', icon: 'remove-circle-outline',   bg: tokens.surface.surface2,   fg: tokens.text[3] },
  { key: 'warning',  label: 'تحذير',  icon: 'alert-circle-outline',    bg: tokens.semantic.warningBg, fg: tokens.semantic.warning },
  { key: 'negative', label: 'سلبية',  icon: 'sad-outline',             bg: tokens.semantic.dangerBg,  fg: tokens.semantic.danger },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  instituteId: string;
  /** Called after successful insert so the parent can refresh / show a toast. */
  onSaved?: () => void;
};

export default function BehaviorNoteSheet({
  visible, onClose, studentId, studentName, instituteId, onSaved,
}: Props) {
  const [sentiment, setSentiment] = useState<Sentiment>('positive');
  const [note, setNote] = useState('');
  const [visibleToParent, setVisibleToParent] = useState(true);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setSentiment('positive');
    setNote('');
    setVisibleToParent(true);
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const handleSave = async () => {
    const trimmed = note.trim();
    if (trimmed.length < 5) {
      Alert.alert('تنبيه', 'اكتب وصفاً قصيراً للملاحظة (5 أحرف على الأقل)');
      return;
    }
    setSaving(true);
    haptics.medium();
    try {
      await addBehaviorNote({
        institute_id: instituteId,
        student_id: studentId,
        sentiment,
        category: null,
        note: trimmed,
        visible_to_parent: visibleToParent,
      });
      haptics.success();
      Alert.alert('تم', `تم حفظ الملاحظة لـ${studentName}`);
      onSaved?.();
      reset();
      onClose();
    } catch (err: any) {
      haptics.error();
      Alert.alert('خطأ', err?.message || 'فشل حفظ الملاحظة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SwipeableSheet visible={visible} onClose={handleClose} maxHeight={0.9}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="document-text-outline" size={20} color={tokens.brand[500]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>ملاحظة سلوكية</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{studentName}</Text>
          </View>
        </View>

        {/* Sentiment selector */}
        <Text style={styles.label}>نوع الملاحظة</Text>
        <View style={styles.kindRow}>
          {SENTIMENT_OPTIONS.map((s) => {
            const active = sentiment === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                onPress={() => { haptics.selection(); setSentiment(s.key); }}
                style={[
                  styles.kindCard,
                  active && { borderColor: s.fg, backgroundColor: s.bg },
                ]}
                activeOpacity={0.85}
              >
                <Ionicons name={s.icon} size={20} color={active ? s.fg : tokens.text[3]} />
                <Text style={[styles.kindLabel, active && { color: s.fg, fontWeight: '800' }]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Note */}
        <Text style={styles.label}>الوصف</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="اكتب الملاحظة هنا..."
          placeholderTextColor={tokens.text[4]}
          style={styles.input}
          multiline
          textAlignVertical="top"
          textAlign="right"
          maxLength={500}
        />
        <Text style={styles.counter}>{note.length}/500</Text>

        {/* Visible to parent toggle */}
        <View style={styles.toggleRow}>
          <Switch
            value={visibleToParent}
            onValueChange={setVisibleToParent}
            trackColor={{ false: tokens.border[2], true: tokens.brand[500] }}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>إظهار لولي الأمر</Text>
            <Text style={styles.toggleHint}>
              {visibleToParent
                ? 'سيشاهد ولي الأمر هذه الملاحظة'
                : 'الملاحظة داخلية — للإدارة والأساتذة فقط'}
            </Text>
          </View>
        </View>

        {/* Save */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, saving && styles.btnDisabled]}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Ionicons name="checkmark" size={18} color="#fff" />}
          <Text style={styles.saveBtnText}>
            {saving ? 'جاري الحفظ...' : 'حفظ الملاحظة'}
          </Text>
        </TouchableOpacity>
      </View>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    gap: 14,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingTop: 6,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '900', color: tokens.text[1], textAlign: 'right' },
  subtitle: { fontSize: 12, color: tokens.text[3], textAlign: 'right' },

  label: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.text[2],
    textAlign: 'right',
    marginTop: 4,
  },

  kindRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  kindCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1.5,
    borderColor: tokens.border[2],
    backgroundColor: tokens.surface.surface,
    gap: 6,
  },
  kindLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.text[3],
  },

  input: {
    backgroundColor: tokens.surface.surface,
    borderWidth: 1,
    borderColor: tokens.border[2],
    borderRadius: tokens.radius.md,
    padding: 12,
    fontSize: 14,
    color: tokens.text[1],
    minHeight: 100,
    textAlign: 'right',
  },
  counter: {
    fontSize: 11,
    color: tokens.text[4],
    textAlign: 'left',
    marginTop: -8,
  },

  toggleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tokens.surface.surface2,
    borderRadius: tokens.radius.md,
    padding: 12,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.text[1],
    textAlign: 'right',
  },
  toggleHint: {
    fontSize: 11,
    color: tokens.text[3],
    textAlign: 'right',
    marginTop: 2,
  },

  saveBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.brand[500],
    ...tokens.shadow.md,
  },
  btnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
