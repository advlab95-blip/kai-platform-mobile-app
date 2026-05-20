import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import useTeacherStore from '../../stores/teacherStore';
import useAuthStore from '../../stores/authStore';

/**
 * Inline multi-target selector for teacher publish flows (videos, exams,
 * materials, galleries, homework, AI lessons, etc.).
 *
 * Reads directly from useTeacherStore so every publish modal stays in sync
 * with the teacher's current pickable sections/groups — no prop drilling needed.
 */
export default function TargetsPicker({ label = 'اختر الشعبة/الكروب' }: { label?: string }) {
  const {
    targets, selectedTargets,
    toggleSelectedTarget, clearSelectedTargets, selectAllTargets,
    loadTargets,
  } = useTeacherStore();
  const userId = useAuthStore((s) => s.userId);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!userId || refreshing) return;
    setRefreshing(true);
    try { await loadTargets(userId); } finally { setRefreshing(false); }
  };

  return (
    <View style={{ marginTop: 12 }}>
      <View style={s.header}>
        <Text style={s.label}>
          {label} ({selectedTargets.length})
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity onPress={selectAllTargets} style={[s.chip, s.chipAll]}>
            <Text style={s.chipAllText}>الكل</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearSelectedTargets} style={[s.chip, s.chipClear]}>
            <Text style={s.chipClearText}>مسح</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ maxHeight: 180 }}
        contentContainerStyle={{ gap: 6 }}
        showsVerticalScrollIndicator={true}
      >
        {targets.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyText}>
              لا توجد شعب/كروبات مخصّصة لك بعد — تواصل مع الإدارة.
            </Text>
            <TouchableOpacity
              onPress={handleRefresh}
              disabled={refreshing}
              style={s.refreshBtn}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#92400E" />
              ) : (
                <>
                  <Ionicons name="refresh" size={14} color="#92400E" />
                  <Text style={s.refreshText}>تحديث</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          targets.map((tgt) => {
            const isSelected = selectedTargets.some((x) =>
              x.classId === tgt.classId && x.sectionId === tgt.sectionId && x.subjectId === tgt.subjectId
            );
            return (
              <TouchableOpacity
                key={`${tgt.classId || ''}-${tgt.sectionId || ''}-${tgt.subjectId || ''}`}
                onPress={() => toggleSelectedTarget(tgt)}
                style={[s.row, isSelected && s.rowSelected]}
              >
                <View style={[s.checkbox, isSelected && s.checkboxChecked]}>
                  {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>
                    {tgt.displayName || tgt.subjectName || '—'}
                  </Text>
                  {tgt.subjectName && tgt.subjectName !== tgt.displayName && (
                    <Text style={s.rowSubtitle} numberOfLines={1}>
                      {tgt.subjectName}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  label: { fontSize: 12, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  chipAll: { backgroundColor: '#EEF2FF' },
  chipAllText: { fontSize: 10, color: '#4338CA', fontWeight: '700' },
  chipClear: { backgroundColor: '#FEE2E2' },
  chipClearText: { fontSize: 10, color: '#DC2626', fontWeight: '700' },

  emptyBox: {
    padding: 12, backgroundColor: '#FEF3C7',
    borderRadius: 10, borderWidth: 1, borderColor: '#FCD34D',
    gap: 8,
  },
  emptyText: { fontSize: 11, color: '#92400E', textAlign: 'right' },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, alignSelf: 'flex-end',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#FDE68A', borderWidth: 1, borderColor: '#F59E0B',
  },
  refreshText: { fontSize: 11, fontWeight: '700', color: '#92400E' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: Colors.border,
  },
  rowSelected: { backgroundColor: '#EEF2FF', borderColor: Colors.primary },
  checkbox: {
    width: 18, height: 18, borderRadius: 4,
    borderWidth: 2, borderColor: Colors.border,
    backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  rowTitle: { fontSize: 12, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  rowSubtitle: { fontSize: 10, color: Colors.textMuted, textAlign: 'right' },
});
