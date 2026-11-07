import type { OrderStatus } from '../components/StatusBadge';

export const PAGE_SIZE = 25;

export const STATUSES: readonly OrderStatus[] = ['new', 'paid', 'shipped', 'cancelled'];

export interface ListState {
  status: OrderStatus | undefined;
  q: string;
  page: number;
}

/** Reads the list state from the URL; an invalid value falls back to its default. */
export function parseListState(params: URLSearchParams): ListState {
  const rawStatus = params.get('status');
  const status = STATUSES.find((s) => s === rawStatus);
  const q = (params.get('q') ?? '').trim();
  const rawPage = params.get('page') ?? '';
  const page = /^\d+$/.test(rawPage) && Number.isSafeInteger(Number(rawPage)) ? Number(rawPage) : 1;
  return { status, q, page: Math.max(1, page) };
}

/** The query string of a list state: defaults are left out. */
export function buildSearch(state: ListState): string {
  const params = new URLSearchParams();
  if (state.status) params.set('status', state.status);
  if (state.q) params.set('q', state.q);
  if (state.page > 1) params.set('page', String(state.page));
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** The "26–50 of 137 orders" summary. */
export function summary(page: number, pageSize: number, total: number, shown: number): string {
  if (total === 0 || shown === 0) return `${String(total)} orders`;
  const from = (page - 1) * pageSize + 1;
  return `${String(from)}–${String(from + shown - 1)} of ${String(total)} orders`;
}

/** Page numbers to show, with `null` for a gap: first, last and the neighbours of the current. */
export function pageItems(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  const out: (number | null)[] = [];
  let last = 0;
  for (let n = 1; n <= pages; n++) {
    if (!keep.has(n)) continue;
    if (n - last > 1) out.push(null);
    out.push(n);
    last = n;
  }
  return out;
}
