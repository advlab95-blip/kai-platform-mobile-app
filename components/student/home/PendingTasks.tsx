// PendingTasks — first 3 pending task rows with submit button.
// Tap submit → opens TaskSubmitSheet (parent owns the sheet).

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

type TaskItem = {
  id: string;
  title?: string;
  subject?: string;
  due_date?: string | null;
  status?: string;
};

type Props = {
  tasks: TaskItem[];
  onSubmitPress: (task: TaskItem) => void;
};

export default function PendingTasks({ tasks, onSubmitPress }: Props) {
  const { t } = useTranslation();
  if (tasks.length === 0) return null;

  return (
    <>
      <Text style={styles.sectionTitle}>{t('student.currentTasks')}</Text>
      {tasks.slice(0, 3).map((task) => (
        <View key={task.id} style={styles.taskCard}>
          <View style={styles.taskInfo}>
            <Text style={styles.taskTitle}>{task.title || t('student.task')}</Text>
            {task.subject ? <Text style={styles.taskSubject}>{task.subject}</Text> : null}
            {task.due_date && (
              <View style={styles.taskDuePill}>
                <Ionicons name="time-outline" size={11} color={tokens.color.warning} />
                <Text style={styles.taskDueText}>
                  {t('student.dueDate', {
                    date: new Date(task.due_date).toLocaleDateString('ar-IQ'),
                  })}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.taskSubmitBtn}
            activeOpacity={0.85}
            onPress={() => { haptics.selection(); onSubmitPress(task); }}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={tokens.color.teal700} />
          </TouchableOpacity>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 12,
  },
  taskCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  taskInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  taskTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
  },
  taskSubject: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text2,
    marginTop: 2,
    textAlign: 'right',
  },
  taskDuePill: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.warningBg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
  },
  taskDueText: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.warning,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  taskSubmitBtn: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.teal50,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: 10,
    borderWidth: 1,
    borderColor: tokens.color.teal100,
  },
});
