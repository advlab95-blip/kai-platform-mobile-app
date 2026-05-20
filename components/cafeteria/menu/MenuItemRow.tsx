// Menu item row — delete, availability toggle, name + price (د.ع) + optional category chip.
// Toggle off → row dims to 0.55 opacity (preserved from original menu.tsx).
import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

export interface CafeteriaItem {
  id: string;
  name: string;
  price?: number;
  available?: boolean;
  category?: string;
  image_url?: string | null;
}

interface Props {
  item: CafeteriaItem;
  onToggle: (itemId: string, currentAvailable: boolean) => void;
  onDelete: (itemId: string, itemName: string) => void;
}

function MenuItemRow({ item, onToggle, onDelete }: Props) {
  const isAvailable = item.available !== false;

  const handleDelete = useCallback(() => {
    haptics.warning();
    onDelete(item.id, item.name);
  }, [item.id, item.name, onDelete]);

  const handleToggle = useCallback(() => {
    haptics.selection();
    onToggle(item.id, isAvailable);
  }, [item.id, isAvailable, onToggle]);

  return (
    <View style={[styles.card, !isAvailable && styles.cardDimmed]}>
      <TouchableOpacity
        onPress={handleDelete}
        style={styles.deleteBtn}
        accessibilityRole="button"
        accessibilityLabel="حذف"
      >
        <Ionicons name="trash-outline" size={18} color={tokens.color.danger} />
      </TouchableOpacity>
      <Switch
        value={isAvailable}
        onValueChange={handleToggle}
        trackColor={{ false: tokens.color.surface3, true: '#BBF7D0' }}
        thumbColor={isAvailable ? tokens.color.success : tokens.color.text3}
      />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.price}>{(item.price || 0).toLocaleString()} د.ع</Text>
        {item.category ? (
          <View style={styles.categoryChip}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
        ) : null}
      </View>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Ionicons name="fast-food-outline" size={20} color={tokens.color.text3} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg - 2,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  cardDimmed: { opacity: 0.55 },
  body: { flex: 1, alignItems: 'flex-end', gap: 4 },
  name: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  price: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.o600,
  },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface2,
  },
  categoryText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text2,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: tokens.color.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: tokens.color.surface2,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(MenuItemRow);
