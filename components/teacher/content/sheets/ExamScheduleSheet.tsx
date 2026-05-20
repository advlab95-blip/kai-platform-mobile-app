import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import { styles } from '../styles';

export interface ExamScheduleSheetProps {
  visible: boolean;
  onClose: () => void;

  scheduleDate: string;
  setScheduleDate: (v: string) => void;

  scheduleTime: string;
  setScheduleTime: (v: string) => void;

  scheduleNotify: boolean;
  setScheduleNotify: (v: boolean) => void;

  saving: boolean;
  onSchedule: () => void;
}

export default function ExamScheduleSheet({
  visible,
  onClose,
  scheduleDate,
  setScheduleDate,
  scheduleTime,
  setScheduleTime,
  scheduleNotify,
  setScheduleNotify,
  saving,
  onSchedule,
}: ExamScheduleSheetProps) {
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.85} minHeight={0.5}>
      <View style={styles.sheetBody}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>جدولة الامتحان</Text>
          </View>
          <Text style={styles.fieldLabel}>التاريخ</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.textMuted}
            value={scheduleDate}
            onChangeText={setScheduleDate}
            textAlign="right"
          />
          <Text style={styles.fieldLabel}>الوقت</Text>
          <TextInput
            style={styles.input}
            placeholder="HH:MM"
            placeholderTextColor={Colors.textMuted}
            value={scheduleTime}
            onChangeText={setScheduleTime}
            textAlign="right"
          />
          <View style={styles.toggleRow}>
            <Switch
              value={scheduleNotify}
              onValueChange={setScheduleNotify}
              trackColor={{ false: '#E2E8F0', true: Colors.primary }}
            />
            <Text style={styles.toggleLabel}>إشعار الطلاب</Text>
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            onPress={onSchedule}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>جدولة</Text>
            )}
          </TouchableOpacity>
        </View>
    </SwipeableSheet>
  );
}
