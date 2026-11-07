import type { components } from './schema';

export type StaffUser = components['schemas']['StaffUser'];
export type OrderPage = components['schemas']['OrderPage'];
export type OrderSummary = components['schemas']['OrderSummary'];
type OrderStatus = components['schemas']['OrderStatus'];

const BASE = '/api/v1';

/** An error answer of the API (status 0 when the service cannot be reached). */
export class ApiError extends Error {
  readonly status: number;
  readonly retryAfter: number | undefined;

  constructor(status: number, retryAfter?: number) {
    super(`Request failed (${String(status)})`);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

let onUnauthorized: (() => void) | undefined;

/** Registers the function called on a 401 of a staff request (session expired). */
export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  onUnauthorized = handler;
}

interface Options {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

async function request(path: string, opts: Options = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new ApiError(0);
  }
  if (!res.ok) {
    const retry = Number(res.headers.get('Retry-After'));
    throw new ApiError(res.status, Number.isFinite(retry) && retry > 0 ? retry : undefined);
  }
  return res;
}

/** A staff request: a 401 tells the app that the session is gone. */
async function staffRequest(path: string, opts: Options = {}): Promise<Response> {
  try {
    return await request(path, opts);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) onUnauthorized?.();
    throw e;
  }
}

/** One page of orders; ApiError on any failure (401 also signals the app). */
export async function getOrders(
  query: { status?: OrderStatus | undefined; q?: string; page?: number },
  signal?: AbortSignal,
): Promise<OrderPage> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.q) params.set('q', query.q);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const qs = params.toString();
  const res = await staffRequest(`/orders${qs ? `?${qs}` : ''}`, signal ? { signal } : {});
  return (await res.json()) as OrderPage;
}

export type Order = components['schemas']['Order'];
export type OrderTarget = components['schemas']['StatusChangeRequest']['to'];

/** One order with its lines and history; ApiError 404 when unknown. */
export async function getOrder(number: string, signal?: AbortSignal): Promise<Order> {
  const res = await staffRequest(`/orders/${encodeURIComponent(number)}`, signal ? { signal } : {});
  return (await res.json()) as Order;
}

/** Moves an order to a new status; ApiError 409 (changed meanwhile) or 422 (bad reason). */
export async function changeStatus(
  number: string,
  change: { to: OrderTarget; version: number; reason?: string },
): Promise<Order> {
  const res = await staffRequest(`/orders/${encodeURIComponent(number)}/status`, {
    method: 'POST',
    body: change,
  });
  return (await res.json()) as Order;
}

/** The staff member of the current session; ApiError 401 when there is none. */
export async function getMe(signal?: AbortSignal): Promise<StaffUser> {
  // plain request: the auth provider reads the 401 of this one itself
  const res = await request('/auth/me', signal ? { signal } : {});
  return (await res.json()) as StaffUser;
}

export async function login(email: string, password: string): Promise<StaffUser> {
  const res = await request('/auth/login', { method: 'POST', body: { email, password } });
  return (await res.json()) as StaffUser;
}

export async function logout(): Promise<void> {
  await staffRequest('/auth/logout', { method: 'POST' });
}
