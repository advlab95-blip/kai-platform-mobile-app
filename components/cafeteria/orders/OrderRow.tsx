// Cafeteria order row — used in both compact (home recent) and full (orders tab) variants.
// Status helpers live in utils/cafeteriaStatus.ts so the new → preparing → ready → delivered → archived
// pipeline has a single source of truth.
import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { nextStatus, statusLabel } from '../../../utils/cafeteriaStatus';
import { haptics } from '../../../utils/haptics';

export interface CafeteriaOrder {
  id: string;
  status: string;
  item_name?: string;
  requester_name?: string;
  room?: string;
  created_at?: string;
}

interface Props {
  order: CafeteriaOrder;
  variant?: 'full' | 'compact';
  onAdvance: (orderId: string, currentStatus: string) => void;
}

function OrderRow({ order, variant = 'full', onAdvance }: Props) {
  const { t } = useTranslation();
  const st = statusLabel(order.status, t);
  const next = nextStatus(order.status);
  const hasNext = next !== order.status;
  const nextLabel = hasNext ? statusLabel(next, t).label : null;

  const handleAdvance = useCallback(() => {
    haptics.selection();
    onAdvance(order.id, order.status);
  }, [order.id, order.status, onAdvance]);

  if (variant === 'compact') {
    // Home "آخر الطلبات" row — small chevron quick-advance (no label).
    return (
      <View style={styles.card}>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {order.item_name || t('cafeteria.order')}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {order.requester_name || ''}
            {order.room ? ` · ${order.room}` : ''}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
          <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
        </View>
        {hasNext && (
          <TouchableOpacity
            style={styles.compactNext}
            onPress={handleAdvance}
            accessibilityRole="button"
            accessibilityLabel={nextLabel || ''}
          >
            <Ionicons name="arrow-forward" size={16} color={tokens.color.o600} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Full variant — orders tab (status badge + labelled next-status / archive button).
  const isDelivered = order.status === 'delivered';
  const isArchived = order.status === 'archived';

  return (
    <View style={styles.card}>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {order.item_name || t('cafeteria.order')}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {order.requester_name || ''}
          {order.room ? ` · ${order.room}` : ''}
        </Text>
        {order.created_at ? (
          <Text style={styles.time}>
            {new Date(order.created_at).toLocaleTimeString('ar-IQ', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
          <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
        </View>
        {!isDelivered && !isArchived && nextLabel && (
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={handleAdvance}
            accessibilityRole="button"
            accessibilityLabel={nextLabel}
          >
            <Text style={styles.nextBtnText}>{nextLabel}</Text>
            <Ionicons name="arrow-forward" size={14} color={tokens.color.o600} />
          </TouchableOpacity>
        )}
        {isDelivered && (
          <TouchableOpacity
            style={[styles.nextBtn, styles.archiveBtn]}
            onPress={handleAdvance}
            accessibilityRole="button"
            accessibilityLabel={t('cafeteria.archive', { defaultValue: 'أرشفة' })}
          >
            <Text style={[styles.nextBtnText, styles.archiveText]}>
              {t('cafeteria.archive', { defaultValue: 'أرشفة' })}
            </Text>
            <Ionicons name="archive-outline" size={14} color={tokens.color.text3} />
          </TouchableOpacity>
        )}
      </View>
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
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  body: { flex: 1, alignItems: 'flex-end', gap: 2 },
  name: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  meta: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text2,
    textAlign: 'right',
  },
  time: {
    fontSize: tokens.font.size.xs - 1,
    color: tokens.color.text3,
    marginTop: 2,
  },
  right: { alignItems: 'center', gap: 6, marginLeft: 10 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.heavy,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.color.o50,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  nextBtnText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.o600,
  },
  archiveBtn: { backgroundColor: tokens.color.surface2 },
  archiveText: { color: tokens.color.text3 },
  compactNext: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: tokens.color.o50,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
});

export default memo(OrderRow);
