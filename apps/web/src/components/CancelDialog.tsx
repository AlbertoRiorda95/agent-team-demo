import { useState } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

export const REASON_MAX = 500;

/** The cancel confirmation: optional reason, counter, field error, busy and error states. */
export function CancelDialog({
  open,
  number,
  busy,
  fieldError,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  number: string;
  busy: boolean;
  /** Message shown on the reason field (a 422 from the API) */
  fieldError: string | null;
  /** Message shown when the request failed; confirming again retries */
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} title={`Cancel order ${number}?`} onClose={onClose}>
      <CancelForm
        busy={busy}
        fieldError={fieldError}
        error={error}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    </Dialog>
  );
}

function CancelForm({
  busy,
  fieldError,
  error,
  onConfirm,
  onClose,
}: {
  busy: boolean;
  fieldError: string | null;
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const tooLong = reason.length > REASON_MAX;
  const message = tooLong ? `Use at most ${String(REASON_MAX)} characters.` : fieldError;
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!tooLong) onConfirm(reason);
      }}
    >
      <div className="field">
        <label htmlFor="cancel-reason">Reason (optional)</label>
        <textarea
          id="cancel-reason"
          rows={3}
          value={reason}
          aria-invalid={message ? true : undefined}
          aria-describedby={
            message ? 'cancel-reason-error cancel-reason-count' : 'cancel-reason-count'
          }
          onChange={(e) => {
            setReason(e.target.value);
          }}
        />
        <span id="cancel-reason-count" className="counter">
          {reason.length} / {REASON_MAX}
        </span>
        {message && (
          <span id="cancel-reason-error" className="field-error" role="alert">
            {message}
          </span>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onClose}>
          Keep order
        </Button>
        <Button type="submit" variant="danger" busy={busy} disabled={tooLong}>
          Cancel order
        </Button>
      </div>
    </form>
  );
}
