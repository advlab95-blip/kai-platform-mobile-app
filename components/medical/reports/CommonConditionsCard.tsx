// Top-10 conditions list with rank dot (red top 3, amber rest) + count badge.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

interface Props {
  sortedConditions: Array<[string, number]>;
}

function CommonConditionsCard({ sortedConditions }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('medical.commonConditions')}</Text>
      {sortedConditions.length === 0 ? (
        <Text style={styles.empty}>{t('medical.insufficientData')}</Text>
      ) : (
        sortedConditions.map(([condition, count], idx) => (
          <View key={`${condition}-${idx}`} style={styles.row}>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{count}</Text>
            </View>
            <Text style={styles.name} numberOfLines={2}>
              {condition}
            </Text>
            <View
              style={[
                styles.dot,
                { backgroundColor: idx < 3 ? tokens.color.m500 : tokens.color.warning },
              ]}
            />
          </View>
        ))
      )}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border2,
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: {
    flex: 1,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'right',
  },
  countBadge: {
    backgroundColor: tokens.color.m100,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.m600,
    fontFamily: 'Rubik',
  },
  empty: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: 12,
  },
});

export default memo(CommonConditionsCard);
