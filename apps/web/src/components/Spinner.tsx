/** Loading indicator with an accessible status message. */
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <span className="loading">
      <span className="spinner" aria-hidden="true" />
      <span role="status">{label}</span>
    </span>
  );
}
