import { format, parse } from '@albertoriorda95/money';
import type { components } from '../api/schema';

type Amount = components['schemas']['Amount'];

/** Formats an API amount with its currency, for the browser locale (or `locale`). */
export function formatAmount(amount: Amount, locale?: string): string {
  return format(parse(amount.amount, amount.currency), locale ?? navigator.language);
}

/** Formats an ISO date-time as date and time, in the browser locale and time zone. */
export function formatDateTime(iso: string, locale?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
