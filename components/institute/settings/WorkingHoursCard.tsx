// WorkingHoursCard — start/end working hours pair + save action.
// Pure presentational; parent owns hour state and the save handler.

import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';

type Props = {
  startHour: string;
  endHour: string;
  onChangeStart: (v: string) => void;
  onChangeEnd: (v: string) => void;
  onSave: () => void;
  titleLabel: string;
  startLabel: string;
  endLabel: string;
  saveLabel: string;
};

export default function WorkingHoursCard({
  startHour,
  endHour,
  onChangeStart,
  onChangeEnd,
  onSave,
  titleLabel,
  startLabel,
  endLabel,
  saveLabel,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Ionicons name="time" size={20} color={Colors.primary} />
        <Text style={styles.cardTitle}>{titleLabel}</Text>
      </View>
      <View style={styles.hoursRow}>
        <View style={styles.hourField}>
          <Text style={styles.hourLabel}>{startLabel}</Text>
          <TextInput
            style={styles.hourInput}
            value={startHour}
            onChangeText={onChangeStart}
            textAlign="center"
            placeholder="08:00"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        <View style={styles.hourDivider}>
          <Ionicons name="arrow-back" size={18} color={Colors.textMuted} />
        </View>
        <View style={styles.hourField}>
          <Text style={styles.hourLabel}>{endLabel}</Text>
          <TextInput
            style={styles.hourInput}
            value={endHour}
            onChangeText={onChangeEnd}
            textAlign="center"
            placeholder="14:00"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
      </View>
      <TouchableOpacity style={styles.saveHoursBtn} onPress={onSave}>
        <Text style={styles.saveHoursBtnText}>{saveLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hourField: {
    flex: 1,
  },
  hourLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 6,
  },
  hourInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  hourDivider: {
    paddingTop: 18,
  },
  saveHoursBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  saveHoursBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
