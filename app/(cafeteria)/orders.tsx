// Cafeteria orders — realtime list + filter chips + status pipeline.
// Data flow:
//   useCafeteriaStore → orders / loadOrders / updateOrderStatus
//   useDataStore.userInstituteId guards every call (multi-tenant boundary).
//   Realtime: supabase channel filtered by institute_id=eq.${userInstituteId}.
//   Feature gate: useFeatureFlag('cafeteria') → <LockedScreen />.
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../constants/designTokens';
import useDataStore from '../../stores/dataStore';
import useCafeteriaStore from '../../stores/cafeteriaStore';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { supabase } from '../../services/supabase';
import { haptics } from '../../utils/haptics';
import { nextStatus } from '../../utils/cafeteriaStatus';
import OrderRow, { CafeteriaOrder } from '../../components/cafeteria/orders/OrderRow';
import FilterChip from '../../components/cafeteria/shared/FilterChip';
import LockedScreen from '../../components/cafeteria/shared/LockedScreen';
import PdfExportButton from '../../components/institute/PdfExportButton';

const FILTER_KEYS = ['all', 'new', 'preparing', 'ready', 'delivered'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

export default function CafeteriaOrders() {
  const { t } = useTranslation();
  const { userInstituteId } = useDataStore();
  const { orders, loadOrders, updateOrderStatus } = useCafeteriaStore();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const isEnabled = useFeatureFlag('cafeteria');

  useEffect(() => {
    if (userInstituteId) loadOrders(userInstituteId);
  }, [userInstituteId]);

  // Realtime subscription — new/updated orders appear live without manual refresh.
  // The institute_id=eq.${userInstituteId} filter is the multi-tenant boundary.
  //
  // SCOPE NOTE (bandwidth): cafeteria_orders has no per-operator owner column
  // (schema columns: institute_id, ordered_by [customer], ordered_by_role,
  // status, items, ...). All cafeteria-role users in an institute legitimately
  // share one queue — orders are not assigned to a specific operator. The
  // institute_id filter is therefore the correct (and tightest available)
  // server-side scope. If we later add a `cafeteria_operator_id` / station
  // column we should tighten this to `cafeteria_operator_id=eq.${userId}`.
  // Worst case today: an institute with N parallel cafeteria devices receives
  // each order INSERT N times — acceptable because N is small (~1–3).
  useEffect(() => {
    if (!userInstituteId) return;
    const channel = supabase
      .channel(`cafeteria_orders_${userInstituteId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cafeteria_orders', filter: `institute_id=eq.${userInstituteId}` },
        () => { loadOrders(userInstituteId).catch(() => {}); }
      )
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [userInstituteId, loadOrders]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { if (userInstituteId) await loadOrders(userInstituteId); } finally { setRefreshing(false); }
  }, [userInstituteId]);

  const labelFor = useCallback(
    (key: FilterKey): string => {
      const map: Record<FilterKey, string> = {
        all: t('cafeteria.allFilter'),
        new: t('cafeteria.orderNew'),
        preparing: t('cafeteria.orderPreparing'),
        ready: t('cafeteria.orderReady'),
        delivered: t('cafeteria.orderDelivered'),
      };
      return map[key];
    },
    [t],
  );

  // Counts per chip — `all` excludes archived; `new` matches `new` OR `pending` (legacy alias).
  const chipCounts = useMemo(() => {
    const counts: Record<FilterKey, number> = {
      all: 0, new: 0, preparing: 0, ready: 0, delivered: 0,
    };
    orders.forEach((o: any) => {
      if (o.status !== 'archived') counts.all += 1;
      if (o.status === 'new' || o.status === 'pending') counts.new += 1;
      if (o.status === 'preparing') counts.preparing += 1;
      if (o.status === 'ready') counts.ready += 1;
      if (o.status === 'delivered') counts.delivered += 1;
    });
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (filter === 'all') {
      return orders.filter((o: any) => o.status !== 'archived'); // hide archived from default view
    }
    return orders.filter(
      (o: any) => o.status === filter || (filter === 'new' && o.status === 'pending'),
    );
  }, [orders, filter]);

  const handleStatusChange = useCallback(
    async (orderId: string, currentStatus: string) => {
      const next = nextStatus(currentStatus);
      if (next === currentStatus) return;
      try {
        if (userInstituteId) await updateOrderStatus(orderId, next, userInstituteId);
      } catch (err: any) {
        Alert.alert(t('common.error'), err?.message || t('cafeteria.updateFailed'));
      }
    },
    [userInstituteId, updateOrderStatus, t],
  );

  const renderOrder = useCallback(
    ({ item }: { item: CafeteriaOrder }) => (
      <OrderRow order={item} variant="full" onAdvance={handleStatusChange} />
    ),
    [handleStatusChange],
  );

  const keyExtractor = useCallback(
    (item: CafeteriaOrder, idx: number) => item.id || `${idx}`,
    [],
  );

  if (!isEnabled) return <LockedScreen />;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('cafeteria.ordersTitle')}
        gradient={tokens.gradient.cafeteria}
        glowAccent="rgba(249,115,22,0.35)"
        showBack={false}
      />

      <View style={styles.filterRow}>
        {FILTER_KEYS.map((key) => (
          <FilterChip
            key={key}
            label={labelFor(key)}
            active={filter === key}
            count={chipCounts[key]}
            onPress={() => setFilter(key)}
          />
        ))}
      </View>

      {/* Export the currently-filtered list as a printable PDF. Useful for
          end-of-day reports the cashier wants to file. */}
      {filteredOrders.length > 0 && (
        <View style={styles.exportRow}>
          <PdfExportButton
            title={`طلبات ${labelFor(filter)}`}
            filename={`orders_${filter}_${new Date().toISOString().slice(0, 10)}`}
            columns={[
              { key: 'time',           label: 'الوقت' },
              { key: 'item_name',      label: 'المنتج' },
              { key: 'requester_name', label: 'الطالب' },
              { key: 'status_label',   label: 'الحالة' },
            ]}
            data={filteredOrders.map((o: any) => ({
              time: o.created_at ? new Date(o.created_at).toLocaleTimeString('ar-IQ') : '—',
              item_name: o.item_name || '—',
              requester_name: o.requester_name || '—',
              status_label: labelFor((o.status === 'pending' ? 'new' : o.status) as FilterKey) || o.status,
            }))}
            label="تصدير PDF"
          />
        </View>
      )}

      <FlashList
        data={filteredOrders}
        keyExtractor={keyExtractor}
        renderItem={renderOrder}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('cafeteria.noOrders')}</Text>}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.color.o600}
          />
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
    textAlign: 'right',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  exportRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingVertical: 40,
  },
});
