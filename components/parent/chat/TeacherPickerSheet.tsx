// Bottom sheet to pick a teacher to chat with (brief §7.4).
// Caller fetches teachers via api.getStudentAssignedTeachers — preserved verbatim there.
import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import SwipeableSheet from '../../shared/SwipeableSheet';
import { tokens } from '../../../constants/designTokens';

export interface TeacherItem {
  id: string;
  full_name: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  loading: boolean;
  teachers: TeacherItem[];
  onSelect: (teacher: TeacherItem) => void;
}

function TeacherPickerSheet({ visible, onClose, loading, teachers, onSelect }: Props) {
  const { t } = useTranslation();
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.7}>
      <View style={styles.body}>
        <Text style={styles.title}>
          {t('parent.selectTeacher', { defaultValue: 'اختر معلماً' })}
        </Text>
        {loading ? (
          <ActivityIndicator color={tokens.color.p600} style={{ marginVertical: 20 }} />
        ) : teachers.length === 0 ? (
          <Text style={styles.empty}>
            {t('parent.noTeachersForChild', { defaultValue: 'لا يوجد معلمون مرتبطون بالطفل بعد' })}
          </Text>
        ) : (
          <FlashList
            data={teachers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => onSelect(item)}
                accessibilityRole="button"
              >
                <View style={styles.avatar}>
                  <Ionicons name="school" size={18} color={tokens.color.success} />
                </View>
                <Text style={styles.name} numberOfLines={1}>{item.full_name}</Text>
                <Ionicons name="chevron-back" size={16} color={tokens.color.text3} />
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 20,
    minHeight: 240,
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 14,
  },
  empty: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.color.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'right',
  },
});

export default memo(TeacherPickerSheet);
