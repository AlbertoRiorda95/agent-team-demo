import { useEffect } from 'react';

/** How long a toast stays on screen. */
export const TOAST_MS = 5000;

/** A polite success message; it never takes focus and goes away by itself. */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => {
      onDone();
    }, TOAST_MS);
    return () => { clearTimeout(id); };
  }, [message, onDone]);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {message && <p className="toast">{message}</p>}
    </div>
  );
}
