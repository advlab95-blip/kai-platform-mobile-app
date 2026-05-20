// ScheduleSlotEditSheet — swipeable sheet to add/edit a timetable slot.
// Pure presentational: parent owns all field state, picker visibility, and save handler.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import { haptics } from '../../../../utils/haptics';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../../shared/KeyboardAwareScroll';

type Props = {
  visible: boolean;
  isEditing: boolean;
  dayLabel: string;

  // Field values
  subject: string;
  room: string;
  startTime: string;
  endTime: string;
  classId: string | null;
  teacherId: string | null;
  className: string | null;
  teacherName: string | null;

  // State
  saving: boolean;

  // Handlers
  onClose: () => void;
  onChangeSubject: (v: string) => void;
  onChangeRoom: (v: string) => void;
  onOpenClassPicker: () => void;
  onOpenTeacherPicker: () => void;
  onOpenStartTimePicker: () => void;
  onOpenEndTimePicker: () => void;
  onSave: () => void;
};

export default function ScheduleSlotEditSheet({
  visible,
  isEditing,
  dayLabel,
  subject,
  room,
  startTime,
  endTime,
  classId,
  teacherId,
  className,
  teacherName,
  saving,
  onClose,
  onChangeSubject,
  onChangeRoom,
  onOpenClassPicker,
  onOpenTeacherPicker,
  onOpenStartTimePicker,
  onOpenEndTimePicker,
  onSave,
}: Props) {
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.92}>
      <KeyboardAwareScroll
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 20 }}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>
            {isEditing ? 'تعديل الحصة' : 'إضافة حصة جديدة'}
          </Text>
          <Text style={styles.sheetSub}>{dayLabel}</Text>
        </View>

        {/* Class picker */}
        <Text style={styles.fieldLabel}>الصف</Text>
        <TouchableOpacity
          style={styles.pickerBtn}
          onPress={() => { haptics.light(); onOpenClassPicker(); }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
          <Text style={[styles.pickerBtnText, !classId && styles.pickerBtnPlaceholder]}>
            {classId ? (className || 'صف محذوف') : 'اختر الصف'}
          </Text>
          <Ionicons name="school-outline" size={18} color={Colors.primary} />
        </TouchableOpacity>

        {/* Teacher picker */}
        <Text style={styles.fieldLabel}>الأستاذ</Text>
        <TouchableOpacity
          style={styles.pickerBtn}
          onPress={() => { haptics.light(); onOpenTeacherPicker(); }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
          <Text style={[styles.pickerBtnText, !teacherId && styles.pickerBtnPlaceholder]}>
            {teacherId ? (teacherName || 'أستاذ محذوف') : 'اختر الأستاذ'}
          </Text>
          <Ionicons name="person-outline" size={18} color={Colors.primary} />
        </TouchableOpacity>

        {/* Subject */}
        <Text style={styles.fieldLabel}>المادة</Text>
        <TextInput
          style={styles.input}
          placeholder="مثل: رياضيات، فيزياء، لغة عربية"
          placeholderTextColor={Colors.textMuted}
          value={subject}
          onChangeText={onChangeSubject}
          textAlign="right"
        />

        {/* Room */}
        <Text style={styles.fieldLabel}>القاعة (اختياري)</Text>
        <TextInput
          style={styles.input}
          placeholder="مثل: قاعة 201"
          placeholderTextColor={Colors.textMuted}
          value={room}
          onChangeText={onChangeRoom}
          textAlign="right"
        />

        {/* Time row */}
        <View style={styles.timeRow}>
          <View style={styles.timeField}>
            <Text style={styles.fieldLabel}>البداية</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => { haptics.light(); onOpenStartTimePicker(); }}
              activeOpacity={0.7}
            >
              <Text style={styles.pickerBtnText}>{startTime}</Text>
              <Ionicons name="time-outline" size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.timeField}>
            <Text style={styles.fieldLabel}>النهاية</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => { haptics.light(); onOpenEndTimePicker(); }}
              activeOpacity={0.7}
            >
              <Text style={styles.pickerBtnText}>{endTime}</Text>
              <Ionicons name="time-outline" size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={onSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>حفظ الحصة</Text>
            </>
          )}
        </TouchableOpacity>
      </KeyboardAwareScroll>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  sheetHeader: {
    paddingTop: 4,
    paddingBottom: 16,
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.text,
  },
  sheetSub: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 10,
  },
  pickerBtnText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
  },
  pickerBtnPlaceholder: {
    color: Colors.textMuted,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textAlign: 'right',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeField: {
    flex: 1,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
});
