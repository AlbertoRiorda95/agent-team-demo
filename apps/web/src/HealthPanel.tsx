import type { HealthState } from './useHealth';

export function HealthPanel({ state, onRetry }: { state: HealthState; onRetry: () => void }) {
  if (state === 'loading') {
    return (
      <div className="panel" aria-busy="true">
        <span className="spinner" aria-hidden="true" />
        <span role="status">Loading…</span>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="panel panel-error" role="alert">
        <span>The API is unreachable.</span>
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className="panel">
      <span role="status">Orders — API ok</span>
    </div>
  );
}
