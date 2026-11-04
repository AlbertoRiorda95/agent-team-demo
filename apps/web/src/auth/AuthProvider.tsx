import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ApiError,
  getMe,
  logout as apiLogout,
  setUnauthorizedHandler,
  type StaffUser,
} from '../api/client';
import { AuthContext, type AuthState } from './useAuth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'checking' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getMe(controller.signal).then(
      (user) => {
        setState({ status: 'signedIn', user });
      },
      (e: unknown) => {
        if (controller.signal.aborted) return;
        setState(
          e instanceof ApiError && e.status === 401 ? { status: 'anonymous' } : { status: 'error' },
        );
      },
    );
    return () => {
      controller.abort();
    };
  }, [attempt]);

  // any 401 of a staff request: the session is gone
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setState({ status: 'anonymous' });
    });
    return () => {
      setUnauthorizedHandler(undefined);
    };
  }, []);

  const signedIn = useCallback((user: StaffUser) => {
    setState({ status: 'signedIn', user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) throw e;
    }
    setState({ status: 'anonymous' });
  }, []);

  const retry = useCallback(() => {
    setState({ status: 'checking' });
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({ state, signedIn, logout, retry }),
    [state, signedIn, logout, retry],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
