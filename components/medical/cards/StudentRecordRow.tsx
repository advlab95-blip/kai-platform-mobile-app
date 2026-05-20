// Shared row used by both StudentsList and RecentRecords on the medical home.
// Two visual modes:
//   - "student" (left icon = check or person; tags = blood-type + record-status chips)
//   - "record"  (left icon = warning or document; meta + alert + sub-meta)
import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

export interface StudentRowData {
  id?: string;
  full_name?: string;
  blood_type?: string;
  hasRecord?: boolean;
}

export interface RecordRowData {
  id?: string;
  student_id?: string;
  blood_type?: string;
  blood_pressure?: string;
  sugar_level?: string;
  eyes?: string;
  dental?: string;
  allergies?: string;
  chronic_conditions?: string;
  users?: { full_name?: string } | null;
}

interface BaseProps {
  onPress: (e?: GestureResponderEvent) => void;
}

export const StudentRowItem = memo(function StudentRowItem(
  props: BaseProps & { student: StudentRowData },
) {
  const { t } = useTranslation();
  const { student, onPress } = props;
  const hasRecord = !!student.hasRecord;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={student.full_name}
    >
      <Ionicons name="chevron-back" size={16} color={tokens.color.text3} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {student.full_name}
        </Text>
        <View style={styles.tagsRow}>
          {student.blood_type ? (
            <Text style={[styles.tag, { color: tokens.color.m500 }]}>
              {t('medical.bloodTypePrefix', { type: student.blood_type })}
            </Text>
          ) : null}
          <Text
            style={[
              styles.tag,
              { color: hasRecord ? tokens.color.success : tokens.color.text3 },
            ]}
          >
            {hasRecord ? t('medical.recordComplete') : t('medical.noRecord')}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.iconBox,
          { backgroundColor: hasRecord ? tokens.color.successBg : tokens.color.surface2 },
        ]}
      >
        <Ionicons
          name={hasRecord ? 'checkmark-circle' : 'person'}
          size={18}
          color={hasRecord ? tokens.color.success : tokens.color.text3}
        />
      </View>
    </TouchableOpacity>
  );
});

export const RecentRecordRow = memo(function RecentRecordRow(
  props: BaseProps & { record: RecordRowData },
) {
  const { t } = useTranslation();
  const { record, onPress } = props;
  const tags: string[] = [];
  if (record.blood_type) tags.push(t('medical.bloodTypePrefix', { type: record.blood_type }));
  if (record.blood_pressure) tags.push(t('medical.pressurePrefix', { pressure: record.blood_pressure }));
  if (record.sugar_level) tags.push(t('medical.sugarPrefix', { sugar: record.sugar_level }));
  const hasAlert = !!(record.chronic_conditions || record.allergies);
  const subMetaParts: string[] = [];
  if (record.eyes) subMetaParts.push(t('medical.eyesPrefix', { eyes: record.eyes }));
  if (record.dental) subMetaParts.push(t('medical.dentalPrefix', { dental: record.dental }));

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={record.users?.full_name || t('medical.student')}
    >
      <Ionicons name="chevron-back" size={16} color={tokens.color.text3} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {record.users?.full_name || t('medical.student')}
        </Text>
        <Text style={styles.meta}>{tags.join('  |  ') || t('medical.noDataLabel')}</Text>
        {hasAlert ? (
          <View style={styles.alertRow}>
            <Ionicons name="warning" size={11} color={tokens.color.m500} />
            <Text style={styles.alertText} numberOfLines={2}>
              {[
                record.chronic_conditions,
                record.allergies ? t('medical.allergyPrefix', { allergy: record.allergies }) : '',
              ]
                .filter(Boolean)
                .join(' | ')}
            </Text>
          </View>
        ) : null}
        {subMetaParts.length > 0 ? (
          <Text style={styles.subMeta}>{subMetaParts.join('  |  ')}</Text>
        ) : null}
      </View>
      <View
        style={[
          styles.iconBox,
          { backgroundColor: hasAlert ? tokens.color.m100 : tokens.color.m100 },
        ]}
      >
        <Ionicons
          name={hasAlert ? 'warning' : 'document-text'}
          size={18}
          color={tokens.color.m600}
        />
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  info: { flex: 1, alignItems: 'flex-end', gap: 2, marginHorizontal: 10 },
  name: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  tagsRow: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end' },
  tag: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold },
  meta: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text2,
    textAlign: 'right',
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 3,
  },
  alertText: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.m500,
    fontWeight: tokens.font.weight.bold,
    textAlign: 'right',
    flexShrink: 1,
  },
  subMeta: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text3,
    textAlign: 'right',
    marginTop: 2,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
