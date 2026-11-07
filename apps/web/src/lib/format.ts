import { format, parse, sum, toDecimalString } from '@albertoriorda95/money';
import type { components } from '../api/schema';

type Amount = components['schemas']['Amount'];

/** Formats an API amount with its currency, for the browser locale (or `locale`). */
export function formatAmount(amount: Amount, locale?: string): string {
  return format(parse(amount.amount, amount.currency), locale ?? navigator.language);
}

/** The sum of amounts of one currency (an empty list gives zero in `currency`). */
export function sumAmounts(amounts: Amount[], currency: Amount['currency']): Amount {
  const total = sum(
    amounts.length ? amounts.map((a) => parse(a.amount, a.currency)) : [parse('0', currency)],
  );
  return { amount: toDecimalString(total), currency };
}

/** Formats an ISO date-time as date and time, in the browser locale and time zone. */
export function formatDateTime(iso: string, locale?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
