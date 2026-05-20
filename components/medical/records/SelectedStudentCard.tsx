// Card showing the selected student at the top of the records screen.
// Shows the red medkit avatar + name + (optional) blood-type pill.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

interface Props {
  fullName: string;
  bloodType?: string;
}

function SelectedStudentCard({ fullName, bloodType }: Props) {
  return (
    <View style={styles.card}>
      {bloodType ? (
        <View style={styles.bloodPill}>
          <Text style={styles.bloodPillText}>{bloodType}</Text>
        </View>
      ) : null}
      <Text style={styles.name} numberOfLines={1}>
        {fullName}
      </Text>
      <View style={styles.avatar}>
        <Ionicons name="medkit" size={22} color="#fff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    padding: 16,
    marginBottom: tokens.spacing[4],
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.m600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    fontSize: tokens.font.size['2xl'] - 1,
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
    textAlign: 'right',
  },
  bloodPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: tokens.color.m100,
    borderRadius: tokens.radius.pill,
  },
  bloodPillText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.m600,
    fontFamily: 'Rubik',
  },
});

export default memo(SelectedStudentCard);
