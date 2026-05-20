// GradeSummaryStrip — stage-2 live stats (filled count, average, publish state) + publish toggle.
// Pure controlled view; parent supplies all numbers and the publish handler.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

type Props = {
  filledCount: number;
  totalStudents: number;
  avgScore: number;
  isPublished: boolean;
  publishing: boolean;
  onTogglePublish: () => void;
};

export default function GradeSummaryStrip({
  filledCount, totalStudents, avgScore, isPublished, publishing, onTogglePublish,
}: Props) {
  return (
    <>
      <View style={s.summaryStrip}>
        <View style={s.summaryBox}>
          <Text style={s.summaryValue}>{filledCount}/{totalStudents}</Text>
          <Text style={s.summaryLabel}>دخلت درجاتهم</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryBox}>
          <Text style={[s.summaryValue, { color: avgScore >= 70 ? tokens.color.success : avgScore >= 50 ? tokens.color.warning : tokens.color.danger }]}>
            {avgScore}%
          </Text>
          <Text style={s.summaryLabel}>المعدل</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryBox}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons
              name={isPublished ? 'checkmark-circle' : 'time-outline'}
              size={14}
              color={isPublished ? tokens.color.success : tokens.color.warning}
            />
            <Text style={[s.summaryValue, {
              fontSize: tokens.font.size.md,
              color: isPublished ? tokens.color.success : tokens.color.warning,
            }]}>
              {isPublished ? 'منشور' : 'مسودّة'}
            </Text>
          </View>
          <Text style={s.summaryLabel}>حالة الطلاب</Text>
        </View>
      </View>

      {/* Publish/unpublish toggle — visible only if at least one grade is saved */}
      {filledCount > 0 && (
        <TouchableOpacity
          style={[s.publishBtn, isPublished ? s.publishBtnOn : s.publishBtnOff]}
          onPress={onTogglePublish}
          disabled={publishing}
          activeOpacity={0.85}
        >
          {publishing ? (
            <ActivityIndicator size="small" color={isPublished ? tokens.color.text3 : '#fff'} />
          ) : (
            <>
              <Ionicons
                name={isPublished ? 'eye-off-outline' : 'paper-plane-outline'}
                size={16}
                color={isPublished ? tokens.color.text3 : '#fff'}
              />
              <Text style={[s.publishBtnText, { color: isPublished ? tokens.color.text3 : '#fff' }]}>
                {isPublished ? 'إلغاء النشر (إخفاء عن الطلاب)' : 'نشر الدرجات للطلاب'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </>
  );
}

const s = StyleSheet.create({
  summaryStrip: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md, padding: 12,
    borderWidth: 1, borderColor: tokens.color.border2,
  },
  summaryBox: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, height: 30, backgroundColor: tokens.color.border },
  summaryValue: { fontSize: tokens.font.size['2xl'], fontWeight: tokens.font.weight.heavy, color: tokens.color.text },
  summaryLabel: { fontSize: tokens.font.size.xs, color: tokens.color.text3, fontWeight: tokens.font.weight.bold },

  publishBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 16, marginTop: 10,
    borderRadius: tokens.radius.md, paddingVertical: 12,
    borderWidth: 1,
  },
  publishBtnOn: { backgroundColor: tokens.color.surface2, borderColor: tokens.color.border },
  publishBtnOff: { backgroundColor: tokens.color.success, borderColor: tokens.color.success },
  publishBtnText: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.heavy },
});
