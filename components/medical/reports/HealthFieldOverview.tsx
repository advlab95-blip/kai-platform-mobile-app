// 6 horizontal bars: one per HEALTH_FIELDS item, percentage based on total records.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { HEALTH_FIELDS } from '../../../constants/medical';

interface Props {
  totalRecords: number;
  withPressure: number;
  withSugar: number;
  withEyes: number;
  withDental: number;
  withAllergies: number;
  withChronic: number;
}

function HealthFieldOverview({
  totalRecords,
  withPressure,
  withSugar,
  withEyes,
  withDental,
  withAllergies,
  withChronic,
}: Props) {
  const { t } = useTranslation();

  const counts: Record<string, number> = {
    blood_pressure: withPressure,
    sugar_level: withSugar,
    eyes: withEyes,
    dental: withDental,
    allergies: withAllergies,
    chronic_conditions: withChronic,
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('medical.healthDataOverview')}</Text>
      {HEALTH_FIELDS.map((field) => {
        const count = counts[field.key] || 0;
        const pct = totalRecords > 0 ? Math.round((count / totalRecords) * 100) : 0;
        const minWidth = count > 0 ? 5 : 0;
        return (
          <View key={field.key} style={styles.row}>
            <Text style={styles.count}>{count}</Text>
            <View style={styles.barBg}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.max(pct, minWidth)}%`, backgroundColor: field.color },
                ]}
              />
            </View>
            <View style={styles.label}>
              <Text style={styles.labelText} numberOfLines={1}>
                {t(field.labelKey)}
              </Text>
              <View style={[styles.iconChip, { backgroundColor: field.bg }]}>
                <Ionicons name={field.icon as any} size={12} color={field.color} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: 18,
    marginBottom: tokens.spacing[4],
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.sm,
  },
  cardTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: tokens.spacing[4],
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 110,
    justifyContent: 'flex-end',
  },
  labelText: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'right',
    flexShrink: 1,
  },
  iconChip: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barBg: {
    flex: 1,
    height: 16,
    backgroundColor: tokens.color.border2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: { height: 16, borderRadius: 4 },
  count: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text3,
    width: 24,
    textAlign: 'center',
    fontFamily: 'Rubik',
  },
});

export default memo(HealthFieldOverview);
