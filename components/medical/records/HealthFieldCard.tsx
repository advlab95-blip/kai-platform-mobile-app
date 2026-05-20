// One health-field input card (label + colored icon chip + TextInput below).
// Width is controlled by the parent (half / full). Multiline supports the chronic-conditions field.
import React, { memo } from 'react';
import { View, Text, StyleSheet, TextInput, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

interface Props {
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  placeholderColor?: string;
  multiline?: boolean;
  alertStyle?: boolean; // red-themed input (used inside AlertSection)
  cardStyle?: StyleProp<ViewStyle>;
}

function HealthFieldCard({
  label,
  iconName,
  iconColor,
  iconBg,
  value,
  onChangeText,
  placeholder,
  placeholderColor,
  multiline,
  alertStyle,
  cardStyle,
}: Props) {
  return (
    <View style={[!alertStyle && styles.card, cardStyle]}>
      <View style={styles.row}>
        <Text style={[styles.label, alertStyle && styles.alertLabel]}>{label}</Text>
        <View style={[styles.iconChip, { backgroundColor: iconBg }]}>
          <Ionicons name={iconName} size={14} color={iconColor} />
        </View>
      </View>
      <TextInput
        style={[
          styles.input,
          alertStyle && styles.alertInput,
          multiline && styles.textArea,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor || tokens.color.text3}
        textAlign="right"
        multiline={multiline}
        numberOfLines={multiline ? 3 : undefined}
        textAlignVertical={multiline ? 'top' : undefined}
      />
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
  alertLabel: {
    color: tokens.color.m600,
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: tokens.color.surface2,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
  },
  alertInput: {
    backgroundColor: tokens.color.surface,
    borderColor: '#FECACA',
  },
  textArea: { minHeight: 80, paddingTop: 10 },
});

export default memo(HealthFieldCard);
