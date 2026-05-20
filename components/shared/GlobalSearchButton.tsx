import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlobalSearch from './GlobalSearch';

interface Props {
  color?: string;
  size?: number;
  style?: any;
}

// Drop-in header icon that opens the global search modal.
export default function GlobalSearchButton({
  color = 'rgba(255,255,255,0.85)',
  size = 22,
  style,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.btn, style]}
        accessibilityRole="button"
        accessibilityLabel="بحث"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="search" size={size} color={color} />
      </TouchableOpacity>
      <GlobalSearch visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  btn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
