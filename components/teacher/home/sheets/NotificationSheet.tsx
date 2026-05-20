// NotificationSheet — bottom sheet with category chips, class chips, and message
// input. Submits via the parent's onSend handler. Parent owns all state.

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../../../constants/colors';
import { tokens } from '../../../../constants/designTokens';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../../shared/KeyboardAwareScroll';

type Category = { key: string; label: string; icon: any };

type Props = {
  visible: boolean;
  onClose: () => void;
  categories: Category[];
  classes: any[];
  notifCategory: string;
  notifClassId: string;
  notifText: string;
  sending: boolean;
  onChangeCategory: (key: string) => void;
  onChangeClassId: (id: string) => void;
  onChangeText: (txt: string) => void;
  onSend: () => void;
};

export default function NotificationSheet({
  visible,
  onClose,
  categories,
  classes,
  notifCategory,
  notifClassId,
  notifText,
  sending,
  onChangeCategory,
  onChangeClassId,
  onChangeText,
  onSend,
}: Props) {
  const { t } = useTranslation();
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.88}>
      <KeyboardAwareScroll
        style={styles.sheetBody}
        contentContainerStyle={{ paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{t('teacherHome.sendNotification')}</Text>
        </View>

        {/* Category chips */}
        <Text style={styles.fieldLabel}>{t('teacherHome.notifType')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.key}
                onPress={() => onChangeCategory(cat.key)}
                style={[
                  styles.chip,
                  notifCategory === cat.key && styles.chipActive,
                ]}
              >
                <Ionicons
                  name={cat.icon}
                  size={14}
                  color={notifCategory === cat.key ? '#fff' : Colors.textMuted}
                />
                <Text style={[
                  styles.chipText,
                  notifCategory === cat.key && styles.chipTextActive,
                ]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Class selector chips — surfaces an explicit empty-state so teachers
            don't see a blank modal when their teacher_assignments haven't loaded
            yet (the previous "render only if classes.length>0" branch made the
            sheet look broken when the teacher had zero classes assigned). */}
        <Text style={styles.fieldLabel}>{t('teacherVoice.sendTo')}</Text>
        {classes.length === 0 ? (
          <View style={{ paddingVertical: 14, paddingHorizontal: 12, backgroundColor: '#FEF3C7', borderRadius: 10, marginBottom: 12 }}>
            <Text style={{ color: '#92400E', fontSize: 13, textAlign: 'right', fontWeight: '700' }}>
              لا توجد صفوف مُسندة لك بعد. تواصل مع الإدارة لإضافتك إلى صفوف التدريس.
            </Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
              <TouchableOpacity
                onPress={() => onChangeClassId('all')}
                style={[styles.chip, notifClassId === 'all' && styles.chipActive]}
              >
                <Text style={[styles.chipText, notifClassId === 'all' && styles.chipTextActive]}>{t('teacher.allStudents')}</Text>
              </TouchableOpacity>
              {classes.map((cls: any) => (
                <TouchableOpacity
                  key={cls.id}
                  onPress={() => onChangeClassId(cls.id)}
                  style={[styles.chip, notifClassId === cls.id && styles.chipActive]}
                >
                  <Text style={[styles.chipText, notifClassId === cls.id && styles.chipTextActive]}>
                    {cls.name || t('common.class')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Description */}
        <Text style={styles.fieldLabel}>{t('teacherHome.notifDetails')}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder={t('teacherHome.notifDetailsPlaceholder')}
          placeholderTextColor={Colors.textMuted}
          value={notifText}
          onChangeText={onChangeText}
          multiline
          numberOfLines={4}
          textAlign="right"
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="send" size={16} color="#fff" />
              <Text style={styles.sendBtnText}>{t('common.send')}</Text>
            </>
          )}
        </TouchableOpacity>
      </KeyboardAwareScroll>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: tokens.color.text,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.color.text2,
    textAlign: 'right',
    marginBottom: 6,
  },
  input: {
    backgroundColor: tokens.color.bg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: tokens.color.text,
    marginBottom: 10,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 10,
  },
  sendBtn: {
    backgroundColor: tokens.color.brand500,
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: tokens.color.surface2,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  chipActive: {
    backgroundColor: tokens.color.brand500,
    borderColor: tokens.color.brand500,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.color.text2,
  },
  chipTextActive: {
    color: '#fff',
  },
});
