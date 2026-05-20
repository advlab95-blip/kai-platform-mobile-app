// Stepper — 3-dot indicator for the teacher-grades wizard (pick category -> enter -> publish).
// Pure presentational; parent computes the stage from its own state.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../../constants/designTokens';

type Props = { stage: 1 | 2 | 3 };

export default function Stepper({ stage }: Props) {
  return (
    <View style={s.stepperRow}>
      {[1, 2, 3].map((n, idx) => {
        const filled = n <= stage;
        return (
          <React.Fragment key={n}>
            <View style={[s.stepDot, { backgroundColor: filled ? tokens.color.brand500 : tokens.color.surface2 }]}>
              <Text style={[s.stepDotText, { color: filled ? '#fff' : tokens.color.text3 }]}>{n}</Text>
            </View>
            {idx < 2 && (
              <View style={[s.stepLine, { backgroundColor: n < stage ? tokens.color.brand500 : tokens.color.surface2 }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: tokens.color.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border2,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotText: { fontSize: tokens.font.size.base, fontWeight: tokens.font.weight.heavy },
  stepLine: { width: 40, height: 2, marginHorizontal: 6 },
});
