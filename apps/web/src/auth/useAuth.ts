import { createContext, useContext } from 'react';
import type { StaffUser } from '../api/client';

export type AuthState =
  | { status: 'checking' }
  | { status: 'signedIn'; user: StaffUser }
  | { status: 'anonymous' }
  | { status: 'error' };

export interface AuthContextValue {
  state: AuthState;
  /** Called by the login page after a successful login. */
  signedIn: (user: StaffUser) => void;
  /** Ends the session; throws when the server could not be reached. */
  logout: () => Promise<void>;
  /** Checks the session again (after an error). */
  retry: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
