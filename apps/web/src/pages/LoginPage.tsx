import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { ApiError, login } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { safeNext } from '../auth/next';

type Failure = { kind: 'message'; text: string } | { kind: 'down' };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function failureOf(e: unknown): Failure {
  if (e instanceof ApiError) {
    if (e.status === 401) return { kind: 'message', text: 'Wrong email or password.' };
    if (e.status === 429) {
      const minutes = Math.max(1, Math.ceil((e.retryAfter ?? 60) / 60));
      return {
        kind: 'message',
        text: `Too many attempts. Try again in ${String(minutes)} ${minutes === 1 ? 'minute' : 'minutes'}.`,
      };
    }
    if (e.status === 422) return { kind: 'message', text: 'Enter a valid email and password.' };
  }
  return { kind: 'down' };
}

export function LoginPage() {
  const { state, signedIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (failure) errorRef.current?.focus();
  }, [failure]);

  if (state.status === 'signedIn') return <Navigate to={next} replace />;

  function invalid(text: string) {
    setFailure({ kind: 'message', text });
  }

  async function submit(event?: SyntheticEvent) {
    event?.preventDefault();
    if (busy) return;
    const trimmed = email.trim();
    if (trimmed === '') {
      invalid('Enter your email.');
      return;
    }
    if (!EMAIL_SHAPE.test(trimmed)) {
      invalid('Enter a valid email.');
      return;
    }
    if (password === '') {
      invalid('Enter your password.');
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const user = await login(trimmed, password);
      signedIn(user);
      void navigate(next, { replace: true });
    } catch (e) {
      setFailure(failureOf(e));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Log in</h1>
      <form className="panel form" noValidate aria-busy={busy} onSubmit={(e) => void submit(e)}>
        {failure && (
          <div className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
            <span>{failure.kind === 'down' ? "Can't reach the service." : failure.text}</span>
            {failure.kind === 'down' && (
              <button type="button" onClick={() => void submit()}>
                Retry
              </button>
            )}
          </div>
        )}
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        </label>
        <button type="submit" disabled={busy}>
          Log in
        </button>
      </form>
    </main>
  );
}
