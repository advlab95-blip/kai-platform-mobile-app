// Stage summary banner — shows total student count for the active stage.
//
// Visual: tokens-driven card with a colored icon bubble (consistent with the
// "atoms → molecules" pattern used across institute screens). The previous
// flat pill was readable but lacked the visual hierarchy of the rest of the
// list, so it felt disconnected from the grade cards below.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

interface Props {
  total: number;
}

export default function StageSummary({ total }: Props) {
  return (
    <View style={styles.stageSummary}>
      <View style={styles.bubble}>
        <Ionicons name="people" size={16} color={tokens.color.brand600} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>إجمالي الطلاب في هذه المرحلة</Text>
        <Text style={styles.value}>
          {total.toLocaleString('ar')} <Text style={styles.valueUnit}>طالب</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stageSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: tokens.color.brand50,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.brand100,
  },
  bubble: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brand100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text2,
    textAlign: 'right',
  },
  value: {
    fontSize: tokens.font.size['2xl'],
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.brand700,
    textAlign: 'right',
    marginTop: 2,
  },
  valueUnit: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text2,
  },
});
