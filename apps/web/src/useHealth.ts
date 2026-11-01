import { useCallback, useEffect, useState } from 'react';
import { getHealth } from './api/client';

export type HealthState = 'loading' | 'error' | 'ok';

export function useHealth(): { state: HealthState; retry: () => void } {
  const [state, setState] = useState<HealthState>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal).then(
      () => {
        setState('ok');
      },
      () => {
        if (!controller.signal.aborted) setState('error');
      },
    );
    return () => {
      controller.abort();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState('loading');
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
