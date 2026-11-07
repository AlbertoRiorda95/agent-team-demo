import { useEffect, useState } from 'react';
import { getOrders, type OrderPage } from '../api/client';
import type { ListState } from '../lib/listState';

export type ListData =
  { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: OrderPage };

type Settled = { key: string; result: { status: 'error' } | { status: 'ok'; data: OrderPage } };

/** Loads one page for a list state; a newer request aborts the older one. */
export function useOrdersList({ status, q, page }: ListState): {
  data: ListData;
  retry: () => void;
} {
  const [settled, setSettled] = useState<Settled | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([status, q, page, attempt]);

  useEffect(() => {
    const controller = new AbortController();
    getOrders({ status, q, page }, controller.signal).then(
      (d) => {
        if (!controller.signal.aborted) setSettled({ key, result: { status: 'ok', data: d } });
      },
      () => {
        if (!controller.signal.aborted) setSettled({ key, result: { status: 'error' } });
      },
    );
    return () => {
      controller.abort();
    };
  }, [status, q, page, key]);

  // an answer for another request than the current one counts as still loading
  const data: ListData = settled?.key === key ? settled.result : { status: 'loading' };
  return {
    data,
    retry: () => {
      setAttempt((n) => n + 1);
    },
  };
}
