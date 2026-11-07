import { useEffect, useState } from 'react';
import { ApiError, getOrder, type Order } from '../api/client';

export type OrderData =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'not-found' }
  | { status: 'ok'; order: Order };

type Settled = { key: string; result: Exclude<OrderData, { status: 'loading' }> };

/** Loads one order; `reload` fetches it again, `replace` shows an order from a response. */
export function useOrder(number: string): {
  data: OrderData;
  reload: () => void;
  replace: (order: Order) => void;
} {
  const [settled, setSettled] = useState<Settled | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([number, attempt]);

  useEffect(() => {
    const controller = new AbortController();
    getOrder(number, controller.signal).then(
      (order) => {
        if (!controller.signal.aborted) setSettled({ key, result: { status: 'ok', order } });
      },
      (e: unknown) => {
        if (controller.signal.aborted) return;
        const notFound = e instanceof ApiError && e.status === 404;
        setSettled({ key, result: { status: notFound ? 'not-found' : 'error' } });
      },
    );
    return () => {
      controller.abort();
    };
  }, [number, key]);

  const data: OrderData = settled?.key === key ? settled.result : { status: 'loading' };
  return {
    data,
    reload: () => {
      setAttempt((n) => n + 1);
    },
    replace: (order) => {
      setSettled({ key, result: { status: 'ok', order } });
    },
  };
}
