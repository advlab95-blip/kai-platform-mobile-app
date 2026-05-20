// SettingsLinkCards — the trio of navigation cards (Medical / Financial / User Codes)
// rendered between the students list and the shared settings panels.
// Pure presentational; parent owns the press handlers.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';

type Props = {
  onPressMedical: () => void;
  onPressFinancial: () => void;
  onPressUserCodes: () => void;
  medicalTitle: string;
  medicalDesc: string;
  financialTitle: string;
  financialDesc: string;
  userCodesTitle: string;
  userCodesDesc: string;
};

export default function SettingsLinkCards({
  onPressMedical,
  onPressFinancial,
  onPressUserCodes,
  medicalTitle,
  medicalDesc,
  financialTitle,
  financialDesc,
  userCodesTitle,
  userCodesDesc,
}: Props) {
  return (
    <>
      {/* Feature 4: Medical Records Link */}
      <TouchableOpacity style={styles.linkCard} activeOpacity={0.8} onPress={onPressMedical}>
        <View style={[styles.linkIcon, { backgroundColor: '#FEE2E2' }]}>
          <Ionicons name="medkit" size={20} color={Colors.medical} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.linkTitle}>{medicalTitle}</Text>
          <Text style={styles.linkSub}>{medicalDesc}</Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      {/* Feature 1: Financial Management */}
      <TouchableOpacity style={styles.linkCard} activeOpacity={0.8} onPress={onPressFinancial}>
        <View style={[styles.linkIcon, { backgroundColor: '#EEF2FF' }]}>
          <Ionicons name="wallet" size={20} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.linkTitle}>{financialTitle}</Text>
          <Text style={styles.linkSub}>{financialDesc}</Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      {/* Feature 2: User Codes Management */}
      <TouchableOpacity style={styles.linkCard} activeOpacity={0.8} onPress={onPressUserCodes}>
        <View style={[styles.linkIcon, { backgroundColor: '#F0FDF4' }]}>
          <Ionicons name="key" size={20} color={Colors.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.linkTitle}>{userCodesTitle}</Text>
          <Text style={styles.linkSub}>{userCodesDesc}</Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
  },
  linkSub: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 1,
  },
});
