// TaskViewerSheet — bottom sheet showing read-only homework details (no structured questions).
// Parent owns the visible/task state and the attachment-open handler.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../../constants/designTokens';
import SwipeableSheet from '../../../shared/SwipeableSheet';

type Props = {
  task: any | null;
  onClose: () => void;
  onOpenAttachment: (url: string) => void;
};

export default function TaskViewerSheet({ task, onClose, onOpenAttachment }: Props) {
  const { t } = useTranslation();

  return (
    <SwipeableSheet
      visible={!!task}
      onClose={onClose}
      maxHeight={0.85}
      sheetStyle={{ backgroundColor: tokens.color.bg }}
    >
      <View>
        <View style={styles.taskHeader}>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <Ionicons name="close" size={22} color={tokens.color.text} />
          </TouchableOpacity>
          <Text style={styles.taskTitle}>
            {task?.title || t('student.assignmentLabel', { defaultValue: 'واجب' })}
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
          {task?.description ? (
            <View style={styles.taskDescBox}>
              <Text style={styles.taskDescText}>
                {task.description}
              </Text>
            </View>
          ) : null}
          {task?.due_date && (
            <View style={styles.taskDueRow}>
              <Text style={styles.taskDueDate}>
                {new Date(task.due_date).toLocaleDateString('ar-IQ')}
              </Text>
              <Text style={styles.taskDueLabel}>{t('student.dueLabel', { defaultValue: 'الموعد:' })}</Text>
              <Ionicons name="time-outline" size={16} color={tokens.color.warning} />
            </View>
          )}
          {task?.attachment_url && (
            <TouchableOpacity
              style={styles.attachmentBtn}
              activeOpacity={0.85}
              onPress={() => onOpenAttachment(task.attachment_url)}
            >
              <Ionicons name="attach" size={20} color={tokens.color.teal700} />
              <Text style={styles.attachmentText}>
                {t('student.openAttachment', { defaultValue: 'فتح المرفق' })}
              </Text>
            </TouchableOpacity>
          )}
          {!task?.description && !task?.attachment_url && (
            <Text style={styles.taskEmpty}>
              {t('student.noExtraDetails', { defaultValue: 'لا يوجد تفاصيل إضافية' })}
            </Text>
          )}
        </ScrollView>
      </View>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  taskHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  taskTitle: {
    flex: 1,
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  taskDescBox: {
    backgroundColor: tokens.color.surface2,
    padding: 14,
    borderRadius: tokens.radius.md,
    marginBottom: 12,
  },
  taskDescText: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text,
    textAlign: 'right',
    lineHeight: 22,
    writingDirection: 'rtl',
  },
  taskDueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    justifyContent: 'flex-end',
  },
  taskDueDate: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.warning,
  },
  taskDueLabel: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text3,
  },
  attachmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.color.teal50,
    borderWidth: 1,
    borderColor: tokens.color.teal100,
    padding: 14,
    borderRadius: tokens.radius.md,
  },
  attachmentText: {
    flex: 1,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.teal700,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  taskEmpty: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    marginTop: 20,
  },
});
