// InstituteInfoCard — read-only summary card showing the institute name + city.
// Pure presentational; parent owns the institute info object.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';

type Props = {
  instituteInfo: any;
  titleLabel: string;
  nameLabel: string;
  cityLabel: string;
  unspecifiedLabel: string;
};

export default function InstituteInfoCard({
  instituteInfo,
  titleLabel,
  nameLabel,
  cityLabel,
  unspecifiedLabel,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Ionicons name="business" size={20} color={Colors.primary} />
        <Text style={styles.cardTitle}>{titleLabel}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoValue}>{instituteInfo?.name || unspecifiedLabel}</Text>
        <Text style={styles.infoLabel}>{nameLabel}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.infoRow}>
        <Text style={styles.infoValue}>{instituteInfo?.city || unspecifiedLabel}</Text>
        <Text style={styles.infoLabel}>{cityLabel}</Text>
      </View>
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
});
