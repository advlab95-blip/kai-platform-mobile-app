// Read-only "input" that opens the blood-type picker sheet on tap.
import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

interface Props {
  label: string;
  value: string;
  onPress: () => void;
}

function BloodTypeDropdown({ label, value, onPress }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.iconChip}>
          <Ionicons name="medkit" size={14} color={tokens.color.m500} />
        </View>
      </View>
      <TouchableOpacity
        style={styles.dropdownBtn}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name="chevron-down" size={16} color={tokens.color.text3} />
        <Text
          style={[
            styles.dropdownText,
            !value && { color: tokens.color.text3 },
          ]}
        >
          {value || t('medical.chooseBloodType')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginBottom: 8,
  },
  label: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text2,
    textAlign: 'right',
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: tokens.color.m100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.color.surface2,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownText: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
  },
});

export default memo(BloodTypeDropdown);
