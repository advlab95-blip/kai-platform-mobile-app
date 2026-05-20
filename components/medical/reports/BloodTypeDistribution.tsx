// 8 horizontal bars showing blood-type distribution.
// IMPORTANT: keeps the Math.max(width, count > 0 ? 5 : 0) min-width trick from the original
// so a count of 1 is still visible.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { BLOOD_TYPES, BLOOD_TYPE_COLORS } from '../../../constants/medical';

interface Props {
  bloodTypeCounts: Record<string, number>;
  maxCount: number;
}

function BloodTypeDistribution({ bloodTypeCounts, maxCount }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('medical.bloodTypeDistribution')}</Text>
      {BLOOD_TYPES.map((type) => {
        const count = bloodTypeCounts[type] || 0;
        const width = maxCount > 0 ? (count / maxCount) * 100 : 0;
        const minWidth = count > 0 ? 5 : 0;
        return (
          <View key={type} style={styles.row}>
            <Text style={styles.count}>{count}</Text>
            <View style={styles.barContainer}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.max(width, minWidth)}%`,
                    backgroundColor: BLOOD_TYPE_COLORS[type] || tokens.color.text3,
                  },
                ]}
              />
            </View>
            <Text style={styles.label}>{type}</Text>
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
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    width: 36,
    textAlign: 'right',
    fontFamily: 'Rubik',
  },
  barContainer: {
    flex: 1,
    height: 20,
    backgroundColor: tokens.color.border2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: { height: 20, borderRadius: 6 },
  count: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text3,
    width: 24,
    textAlign: 'center',
    fontFamily: 'Rubik',
  },
});

export default memo(BloodTypeDistribution);
