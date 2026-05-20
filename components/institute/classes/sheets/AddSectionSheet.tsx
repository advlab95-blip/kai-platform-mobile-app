// Add-section swipeable sheet with quick-pick Arabic/Latin presets and a custom name.
// Pure presentational — parent controls the visibility, current grade, selected presets,
// the custom-name input value, busy state, and computes which preset names already exist.

import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../../shared/KeyboardAwareScroll';

interface Props {
  visible: boolean;
  gradeName: string;
  // Names of sections already existing under the current grade — used to disable preset chips.
  existingNames: Set<string>;
  selectedPresets: string[];
  customName: string;
  busy: boolean;
  onTogglePreset: (preset: string) => void;
  onChangeCustomName: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const ARABIC_PRESETS = ['أ', 'ب', 'ج', 'د', 'هـ'];
const LATIN_PRESETS = ['A', 'B', 'C', 'D', 'E'];

export default function AddSectionSheet({
  visible, gradeName, existingNames, selectedPresets, customName, busy,
  onTogglePreset, onChangeCustomName, onClose, onSubmit,
}: Props) {
  const renderRow = (items: string[], keyPrefix: string) => (
    <View style={styles.presetRow} key={keyPrefix}>
      {items.map((p) => {
        const taken = existingNames.has(p);
        const picked = selectedPresets.includes(p);
        return (
          <TouchableOpacity
            key={keyPrefix + p}
            activeOpacity={0.75}
            disabled={taken || busy}
            onPress={() => onTogglePreset(p)}
            style={[
              styles.presetChip,
              picked && styles.presetChipActive,
              taken && styles.presetChipDisabled,
            ]}
          >
            <Text
              style={[
                styles.presetChipText,
                picked && styles.presetChipTextActive,
                taken && styles.presetChipTextDisabled,
              ]}
            >
              {p}
            </Text>
            {taken && (
              <View style={styles.presetCheckDot}>
                <Ionicons name="checkmark" size={10} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const totalToAdd = selectedPresets.length + (customName.trim() ? 1 : 0);

  return (
    <SwipeableSheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <KeyboardAwareScroll
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetBody}
        >
          <Text style={styles.modalTitle}>إضافة شعبة جديدة</Text>
          <Text style={styles.modalSubtitle}>{gradeName}</Text>

          <Text style={styles.presetLabel}>اختر من الجاهزة (يمكن اختيار أكثر من واحدة)</Text>
          {renderRow(ARABIC_PRESETS, 'ar-')}
          {renderRow(LATIN_PRESETS, 'en-')}
          <View style={styles.presetDivider}>
            <View style={styles.presetDividerLine} />
            <Text style={styles.presetDividerText}>أو اكتب اسماً مخصصاً</Text>
            <View style={styles.presetDividerLine} />
          </View>

          <TextInput
            value={customName}
            onChangeText={onChangeCustomName}
            placeholder="اسم الشعبة (مثال: أ)"
            placeholderTextColor={Colors.textMuted}
            style={styles.codeInput}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={{ color: Colors.textMuted, fontWeight: '800' }}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={onSubmit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: '#fff', fontWeight: '900' }}>
                  {totalToAdd > 1 ? `إضافة ${totalToAdd} شعب` : 'إضافة'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAwareScroll>
      </KeyboardAvoidingView>
    </SwipeableSheet>
  );
}

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
  presetLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  presetChip: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  presetChipActive: {
    backgroundColor: Colors.primary + '18',
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  presetChipDisabled: {
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    opacity: 0.55,
  },
  presetChipText: { fontSize: 18, fontWeight: '900', color: Colors.text },
  presetChipTextActive: { color: Colors.primary },
  presetChipTextDisabled: { color: Colors.textMuted },
  presetCheckDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    marginBottom: 8,
  },
  presetDividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  presetDividerText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
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
