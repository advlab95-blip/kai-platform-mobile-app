// "آخر الطلبات" section on the cafeteria home.
// Receives the already-sliced orders from the parent + the advance handler.
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import OrderRow, { CafeteriaOrder } from '../orders/OrderRow';

interface Props {
  orders: CafeteriaOrder[];
  onAdvance: (orderId: string, currentStatus: string) => void;
}

function RecentOrders({ orders, onAdvance }: Props) {
  const { t } = useTranslation();

  return (
    <View>
      <Text style={styles.sectionTitle}>{t('cafeteria.latestOrders')}</Text>
      {orders.length === 0 ? (
        <Text style={styles.emptyText}>{t('cafeteria.noOrders')}</Text>
      ) : (
        orders.map((order, idx) => (
          <OrderRow
            key={order.id || idx}
            order={order}
            variant="compact"
            onAdvance={onAdvance}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginTop: tokens.spacing[2],
    marginBottom: tokens.spacing[3],
  },
  emptyText: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: tokens.spacing[5],
  },
});

export default memo(RecentOrders);
