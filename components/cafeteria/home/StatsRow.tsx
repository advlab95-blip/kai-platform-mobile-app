// Two gradient stat cards: new orders count + total menu items count.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

interface Props {
  newOrdersCount: number;
  itemsCount: number;
}

function StatsRow({ newOrdersCount, itemsCount }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      <LinearGradient colors={tokens.gradient.orderStat} style={styles.card}>
        <Text style={styles.value}>{newOrdersCount}</Text>
        <Text style={styles.label}>{t('cafeteria.newOrders')}</Text>
        <View style={styles.iconBg}>
          <Ionicons name="receipt" size={30} color="rgba(255,255,255,0.16)" />
        </View>
      </LinearGradient>

      <LinearGradient colors={tokens.gradient.itemsStat} style={styles.card}>
        <Text style={styles.value}>{itemsCount}</Text>
        <Text style={styles.label}>{t('cafeteria.menuItems')}</Text>
        <View style={styles.iconBg}>
          <Ionicons name="fast-food" size={30} color="rgba(255,255,255,0.16)" />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginBottom: tokens.spacing[4] },
  card: {
    flex: 1,
    borderRadius: tokens.radius.lg,
    padding: 14,
    minHeight: 85,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  value: {
    fontSize: tokens.font.size['3xl'] + 2,
    fontWeight: tokens.font.weight.black,
    color: '#fff',
    textAlign: 'right',
  },
  label: {
    fontSize: tokens.font.size.xs,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: tokens.font.weight.semi,
    textAlign: 'right',
    marginTop: 2,
  },
  iconBg: { position: 'absolute', bottom: 8, left: 8 },
});

export default memo(StatsRow);
