// StudentProgressSheet — drawer showing per-student progress; mounted on demand to keep list fast.
// Pure controlled view; parent decides when it's open and which student to display.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../../constants/designTokens';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import StudentProgress from '../../../shared/StudentProgress';

type Props = {
  student: { id: string; name: string } | null;
  onClose: () => void;
};

export default function StudentProgressSheet({ student, onClose }: Props) {
  return (
    <SwipeableSheet visible={!!student} onClose={onClose} maxHeight={0.85}>
      <View style={s.sheetBody}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
          >
            <Ionicons name="close" size={24} color={tokens.color.text} />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: tokens.font.size['2xl'],
              fontWeight: tokens.font.weight.heavy,
              color: tokens.color.text,
              flex: 1,
              textAlign: 'right',
              marginRight: 12,
            }}
            numberOfLines={1}
          >
            {student?.name}
          </Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {student && <StudentProgress studentId={student.id} />}
          <View style={{ height: 20 }} />
        </ScrollView>
      </View>
    </SwipeableSheet>
  );
}

const s = StyleSheet.create({
  sheetBody: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
});
