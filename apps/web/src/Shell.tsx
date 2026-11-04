import { useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from './auth/useAuth';

/** Guards the staff routes and draws the top bar around them. */
export function Shell() {
  const { state, logout, retry } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);

  if (state.status === 'checking') {
    return (
      <main aria-busy="true">
        <div className="panel">
          <span className="spinner" aria-hidden="true" />
          <span role="status">Checking your session…</span>
        </div>
      </main>
    );
  }
  if (state.status === 'error') {
    return (
      <main>
        <div className="panel panel-error" role="alert">
          <span>Can't reach the service.</span>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      </main>
    );
  }
  if (state.status === 'anonymous') {
    const here = location.pathname + location.search;
    const to = here === '/' ? '/login' : `/login?next=${encodeURIComponent(here)}`;
    return <Navigate to={to} replace />;
  }

  async function onLogout() {
    setBusy(true);
    setLogoutFailed(false);
    try {
      await logout();
      // pushed, so Back lands on the shell route, which sends a signed-out user to login
      void navigate('/login');
    } catch {
      setLogoutFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          Orders
        </Link>
        <span className="topbar-user">{state.user.name}</span>
        <button type="button" disabled={busy} onClick={() => void onLogout()}>
          Log out
        </button>
      </header>
      {logoutFailed && (
        <p className="topbar-error" role="alert">
          Could not log out. Try again.
        </p>
      )}
      <main>
        <Outlet />
      </main>
    </>
  );
}
