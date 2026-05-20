// Add-grade swipeable sheet. Pure presentational — parent owns inputs/state and submit.

import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';

type Track = 'none' | 'علمي' | 'أدبي';

interface Props {
  visible: boolean;
  stageName: string;
  isPrepStage: boolean;
  name: string;
  track: Track;
  busy: boolean;
  onChangeName: (v: string) => void;
  onChangeTrack: (t: Track) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function AddGradeSheet({
  visible, stageName, isPrepStage, name, track, busy,
  onChangeName, onChangeTrack, onClose, onSubmit,
}: Props) {
  return (
    <SwipeableSheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheetBody}>
          <Text style={styles.modalTitle}>إضافة صف جديد</Text>
          <Text style={styles.modalSubtitle}>{stageName}</Text>
          <TextInput
            value={name}
            onChangeText={onChangeName}
            placeholder="اسم الصف (مثال: الأول الابتدائي)"
            placeholderTextColor={Colors.textMuted}
            style={styles.codeInput}
            autoFocus
          />
          {isPrepStage && (
            <>
              <Text style={styles.sectionLabel}>القسم (اختياري)</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {(['none', 'علمي', 'أدبي'] as const).map((tk) => {
                  const active = track === tk;
                  const label = tk === 'none' ? 'بدون قسم' : tk === 'علمي' ? 'علمي' : 'أدبي';
                  return (
                    <TouchableOpacity
                      key={tk}
                      activeOpacity={0.8}
                      onPress={() => onChangeTrack(tk)}
                      style={[styles.trackPill, active && styles.trackPillActive]}
                    >
                      <Text style={[styles.trackPillText, active && styles.trackPillTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={{ color: Colors.textMuted, fontWeight: '800' }}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={onSubmit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: '#fff', fontWeight: '900' }}>إضافة</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SwipeableSheet>
  );
}

// NOTE: styles intentionally mirror the original parent file verbatim.
// `submitBtn` has no backgroundColor in the original — preserved as-is.
const styles = StyleSheet.create({
  sheetBody: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 20 },
  modalTitle: {
    fontSize: 17, fontWeight: '900', color: Colors.text,
    textAlign: 'center', marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textAlign: 'center', marginBottom: 16,
  },
  codeInput: {
    flex: 1, backgroundColor: Colors.background,
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 18, fontWeight: '900', color: Colors.text,
    textAlign: 'center', letterSpacing: 4,
  },
  sectionLabel: {
    fontSize: 12, fontWeight: '800', color: Colors.textMuted,
    textAlign: 'right', marginBottom: 8, marginTop: 6,
  },
  trackPill: {
    minWidth: 92,
    height: 36,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1.2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  trackPillText: { fontSize: 13, fontWeight: '800', color: Colors.textMuted },
  trackPillTextActive: { color: '#fff' },
  submitBtn: {
    paddingVertical: 14, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  cancelBtn: {
    paddingVertical: 12, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, marginTop: 8,
  },
});
