import type { Money } from '@shop/shared';

/** Money crosses the wire in paise; the admin edits and displays rupees. */
export const toRupees = (value: Money | null | undefined): string =>
  value ? (value.amount / 100).toFixed(2) : '';

export const fromRupees = (input: string): number => Math.round(Number(input || 0) * 100);

export const formatMoney = (value: Money | null | undefined): string =>
  value
    ? new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: value.currency,
        maximumFractionDigits: value.amount % 100 === 0 ? 0 : 2,
      }).format(value.amount / 100)
    : '—';

export const formatDate = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

export const titleCase = (value: string): string =>
  value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
