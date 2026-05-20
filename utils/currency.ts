/**
 * Format Iraqi Dinar (IQD) amounts consistently
 */
export function formatIQD(amount: number): string {
  if (!amount && amount !== 0) return '0 د.ع';
  return `${amount.toLocaleString('ar-IQ')} د.ع`;
}

/**
 * Format amount with K/M suffix for dashboard cards
 */
export function formatAmountShort(amount: number): string {
  if (!amount || amount === 0) return '0';
  if (amount < 1000) return amount.toLocaleString('ar-IQ');
  if (amount < 1000000) return `${(amount / 1000).toFixed(1)}K`;
  return `${(amount / 1000000).toFixed(1)}M`;
}
