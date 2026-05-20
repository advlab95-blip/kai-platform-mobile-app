// Cafeteria notifications card — 3 toggles: new-order alert, low-stock, auto-close.
import React, { memo } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

interface Row {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc: string;
}

interface Props {
  notifOrders: boolean;
  notifLowStock: boolean;
  autoClose: boolean;
  onChangeNotifOrders: (v: boolean) => void;
  onChangeNotifLowStock: (v: boolean) => void;
  onChangeAutoClose: (v: boolean) => void;
}

function NotificationsCard({
  notifOrders,
  notifLowStock,
  autoClose,
  onChangeNotifOrders,
  onChangeNotifLowStock,
  onChangeAutoClose,
}: Props) {
  const { t } = useTranslation();

  const rows: Row[] = [
    {
      value: notifOrders,
      onChange: onChangeNotifOrders,
      label: t('cafeteria.newOrderNotif'),
      desc: t('cafeteria.newOrderNotifDesc'),
    },
    {
      value: notifLowStock,
      onChange: onChangeNotifLowStock,
      label: t('cafeteria.lowStockNotif'),
      desc: t('cafeteria.lowStockNotifDesc'),
    },
    {
      value: autoClose,
      onChange: onChangeAutoClose,
      label: t('cafeteria.autoCloseOrders'),
      desc: t('cafeteria.autoCloseOrdersDesc'),
    },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('cafeteria.notificationsSection')}</Text>
        <Ionicons name="notifications" size={20} color={tokens.color.o600} />
      </View>

      {rows.map((row, idx) => (
        <View key={row.label}>
          {idx > 0 && <View style={styles.divider} />}
          <View style={styles.row}>
            <Switch
              value={row.value}
              onValueChange={row.onChange}
              trackColor={{ false: tokens.color.surface3, true: tokens.color.o200 }}
              thumbColor={row.value ? tokens.color.o600 : tokens.color.text3}
            />
            <View style={styles.info}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.desc}>{row.desc}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  info: { flex: 1, alignItems: 'flex-end', marginLeft: 12 },
  label: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'right',
  },
  desc: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
    textAlign: 'right',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: tokens.color.border2,
    marginVertical: 10,
  },
});

export default memo(NotificationsCard);
