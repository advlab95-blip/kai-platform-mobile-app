import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/theme';
import { haptics } from '../../utils/haptics';

interface Props {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  moreLabel?: string;
  moreIcon?: keyof typeof Ionicons.glyphMap;
  onMorePress?: () => void;
}

export default function SectionLabel({ title, icon, moreLabel, moreIcon = 'chevron-back', onMorePress }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.titleWrap}>
        {icon && <Ionicons name={icon} size={14} color={tokens.text[3]} />}
        <Text style={styles.title}>{title}</Text>
      </View>
      {moreLabel && (
        <TouchableOpacity
          style={styles.moreWrap}
          activeOpacity={0.6}
          onPress={() => { haptics.light(); onMorePress?.(); }}
        >
          <Text style={styles.moreText}>{moreLabel}</Text>
          <Ionicons name={moreIcon} size={12} color={tokens.brand[500]} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 2,
    marginBottom: 12,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.text[1],
    textAlign: 'right',
  },
  moreWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  moreText: {
    fontSize: 12,
    color: tokens.brand[500],
    fontWeight: '600',
  },
});
