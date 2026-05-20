// Top bar on the section drill-down view (back chevron + title + subtitle).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';

interface Props {
  sectionName: string;
  gradeName: string;
  onBack: () => void;
}

export default function SectionDetailHeader({ sectionName, gradeName, onBack }: Props) {
  return (
    <View style={styles.detailHeaderBar}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Ionicons name="chevron-forward" size={22} color={Colors.text} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.detailTitle} numberOfLines={1}>شعبة {sectionName}</Text>
        <Text style={styles.detailSubtitle} numberOfLines={1}>{gradeName}</Text>
      </View>
      <View style={{ width: 36 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  detailHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  detailTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  detailSubtitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textAlign: 'center', marginTop: 2 },
});
