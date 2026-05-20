// 2 shortcut tiles: orders / menu — orders tile shows
// the new-orders count as a red badge when > 0.
import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

interface Props {
  newOrdersCount: number;
}

function Shortcuts({ newOrdersCount }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  const goTo = (route: string) => {
    haptics.selection();
    router.push(route as any);
  };

  return (
    <View style={styles.grid}>
      <TouchableOpacity
        style={styles.tile}
        onPress={() => goTo('/(cafeteria)/orders')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('cafeteria.orders')}
      >
        <View style={[styles.iconWrap, { backgroundColor: tokens.color.o500 }]}>
          <Ionicons name="receipt" size={22} color="#fff" />
        </View>
        <Text style={styles.label}>{t('cafeteria.orders')}</Text>
        {newOrdersCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{newOrdersCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tile}
        onPress={() => goTo('/(cafeteria)/menu')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('cafeteria.menu')}
      >
        <View style={[styles.iconWrap, { backgroundColor: tokens.color.warning }]}>
          <Ionicons name="fast-food" size={22} color="#fff" />
        </View>
        <Text style={styles.label}>{t('cafeteria.menu')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tile}
        onPress={() => goTo('/(cafeteria)/sales')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="مبيعات اليوم"
      >
        <View style={[styles.iconWrap, { backgroundColor: tokens.color.success }]}>
          <Ionicons name="cash" size={22} color="#fff" />
        </View>
        <Text style={styles.label}>مبيعات اليوم</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 10, marginBottom: tokens.spacing[4] },
  tile: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.cafeteria,
    shadowOpacity: 0.08,
    position: 'relative',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: tokens.color.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.black,
    color: '#fff',
  },
});

export default memo(Shortcuts);
