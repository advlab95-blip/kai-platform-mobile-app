// Cafeteria order status helpers — single source of truth for the
// new → preparing → ready → delivered → archived progression.
// Shared by app/(cafeteria)/index.tsx, app/(cafeteria)/orders.tsx, and
// components/cafeteria/orders/OrderRow.tsx so a status fix in one place
// reflects everywhere (previously duplicated inline; orders could get
// stuck at "ready" until both copies were updated).
import type { TFunction } from 'i18next';
import { tokens } from '../constants/designTokens';

export type OrderStatus =
  | 'new'
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'archived'
  | (string & {});

/**
 * Canonical state machine. `pending` is a legacy alias for `new`.
 * Anything not in the map returns the same status (no progression).
 */
export const STATUS_PROGRESSION: Record<string, string> = {
  new: 'preparing',
  pending: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
  delivered: 'archived',
};

export function nextStatus(current: string): string {
  return STATUS_PROGRESSION[current] || current;
}

export interface StatusVisual {
  bg: string;
  color: string;
  label: string;
}

/**
 * Returns the badge tint + Arabic label for a given status.
 * Falls back to the raw status string and a neutral chip for
 * unknown values (so realtime payloads with new statuses don't crash).
 */
export function statusLabel(status: string, t: TFunction): StatusVisual {
  const map: Record<string, StatusVisual> = {
    new: {
      bg: tokens.color.statusNewBg,
      color: tokens.color.statusNewFg,
      label: t('cafeteria.orderNew'),
    },
    pending: {
      bg: tokens.color.statusNewBg,
      color: tokens.color.statusNewFg,
      label: t('cafeteria.orderNew'),
    },
    preparing: {
      bg: tokens.color.statusPreparingBg,
      color: tokens.color.statusPreparingFg,
      label: t('cafeteria.orderPreparing'),
    },
    ready: {
      bg: tokens.color.statusReadyBg,
      color: tokens.color.statusReadyFg,
      label: t('cafeteria.orderReady'),
    },
    delivered: {
      bg: tokens.color.statusDeliveredBg,
      color: tokens.color.statusDeliveredFg,
      label: t('cafeteria.orderDelivered'),
    },
    archived: {
      bg: tokens.color.statusArchivedBg,
      color: tokens.color.statusArchivedFg,
      label: t('cafeteria.orderArchived', { defaultValue: 'مؤرشف' }),
    },
  };
  return (
    map[status] || {
      bg: tokens.color.surface2,
      color: tokens.color.text,
      label: status,
    }
  );
}
