// cafeteriaSalesService — daily sales aggregation for the cafeteria home.
// cafeteria_orders stores item_id + item_name but NOT the price at sale time;
// price lives in cafeteria_items. We join both and aggregate client-side
// (typical institute does <500 orders/day — cheap).

import { supabase } from './supabase';

export interface CafeteriaOrderRow {
  id: string;
  item_id: string;
  item_name: string;
  status: string;
  requester_id: string;
  requester_name: string | null;
  created_at: string;
  item?: { price?: number | null };
}

// cafeteria_orders.item_id has no FK constraint to cafeteria_items, so the
// PostgREST embed `item:item_id(price)` silently fails. We pull orders first,
// then resolve prices from cafeteria_items in a single batched IN-query below.
const ORDER_COLS =
  'id, item_id, item_name, status, requester_id, requester_name, created_at';

export interface SalesSummary {
  totalRevenue: number;
  totalOrders: number;
  byStatus: Record<string, number>;
  topItems: Array<{ item_id: string; item_name: string; count: number; revenue: number }>;
}

/** Pull today's orders (since midnight local) and aggregate. The 'cancelled'
 *  status is excluded from revenue. */
export async function getTodaySalesSummary(
  instituteId: string,
): Promise<{ orders: CafeteriaOrderRow[]; summary: SalesSummary }> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('cafeteria_orders')
    .select(ORDER_COLS)
    .eq('institute_id', instituteId)
    .gte('created_at', startOfDay.toISOString())
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw error;

  const rows = ((data as any[]) || []) as CafeteriaOrderRow[];

  // Resolve prices in one batched query (no FK embed possible).
  const itemIds = Array.from(new Set(rows.map((r) => r.item_id).filter(Boolean)));
  const priceMap = new Map<string, number>();
  if (itemIds.length > 0) {
    const { data: priced } = await supabase
      .from('cafeteria_items')
      .select('id, price')
      .in('id', itemIds);
    for (const it of (priced || []) as Array<{ id: string; price: number | null }>) {
      priceMap.set(it.id, Number(it.price) || 0);
    }
  }

  const summary: SalesSummary = {
    totalRevenue: 0,
    totalOrders: 0,
    byStatus: {},
    topItems: [],
  };

  const itemAgg = new Map<string, { name: string; count: number; revenue: number }>();
  for (const r of rows) {
    summary.totalOrders++;
    summary.byStatus[r.status] = (summary.byStatus[r.status] || 0) + 1;
    if (r.status !== 'cancelled') {
      const price = priceMap.get(r.item_id) || 0;
      // Hydrate the row's `item` slot for backward-compat consumers reading r.item?.price.
      r.item = { price };
      summary.totalRevenue += price;
      const cur = itemAgg.get(r.item_id) || { name: r.item_name, count: 0, revenue: 0 };
      cur.count++;
      cur.revenue += price;
      itemAgg.set(r.item_id, cur);
    }
  }

  summary.topItems = Array.from(itemAgg.entries())
    .map(([item_id, v]) => ({ item_id, item_name: v.name, count: v.count, revenue: v.revenue }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { orders: rows, summary };
}

/** Toggle a menu item's availability (out-of-stock = available:false). */
export async function setItemAvailability(
  itemId: string,
  available: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('cafeteria_items')
    .update({ available })
    .eq('id', itemId);
  if (error) throw error;
}
