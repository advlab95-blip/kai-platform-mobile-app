// PickerListSheet — generic SwipeableSheet wrapping a single-select list (class/teacher/time).
// Pure presentational; parent owns visibility, selected value, options.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import { haptics } from '../../../../utils/haptics';
import SwipeableSheet from '../../../shared/SwipeableSheet';

export type PickerOption = {
  id: string;
  label: string;
  disabled?: boolean;
};

type Props = {
  visible: boolean;
  title: string;
  emptyLabel?: string;
  options: PickerOption[];
  selectedId: string | null;
  maxHeight?: number;
  onSelect: (id: string) => void;
  onClose: () => void;
};

export default function PickerListSheet({
  visible,
  title,
  emptyLabel,
  options,
  selectedId,
  maxHeight = 0.7,
  onSelect,
  onClose,
}: Props) {
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={maxHeight}>
      <View style={{ paddingHorizontal: 18, paddingBottom: 20 }}>
        <Text style={styles.pickerSheetTitle}>{title}</Text>
        {options.length === 0 && emptyLabel ? (
          <Text style={styles.pickerEmpty}>{emptyLabel}</Text>
        ) : (
          <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
            {options.map((opt) => {
              const selected = opt.id === selectedId;
              const disabled = !!opt.disabled;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.pickerRow,
                    selected && styles.pickerRowSelected,
                    disabled && styles.pickerRowDisabled,
                  ]}
                  onPress={() => {
                    if (disabled) return;
                    haptics.light();
                    onSelect(opt.id);
                  }}
                  activeOpacity={disabled ? 1 : 0.7}
                  disabled={disabled}
                >
                  <Text
                    style={[
                      styles.pickerRowText,
                      selected && styles.pickerRowTextSelected,
                      disabled && styles.pickerRowTextDisabled,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {selected && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  pickerSheetTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  pickerEmpty: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 30,
    fontWeight: '600',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  pickerRowSelected: {
    backgroundColor: '#EEF2FF',
  },
  pickerRowDisabled: {
    opacity: 0.35,
  },
  pickerRowText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
  },
  pickerRowTextSelected: {
    color: Colors.primary,
  },
  pickerRowTextDisabled: {
    color: Colors.textMuted,
  },
});
