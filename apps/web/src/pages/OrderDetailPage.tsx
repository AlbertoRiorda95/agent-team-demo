import { useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ApiError, changeStatus, type Order, type OrderTarget } from '../api/client';
import { Button } from '../components/Button';
import { CancelDialog } from '../components/CancelDialog';
import { ErrorRetry } from '../components/ErrorRetry';
import { OrderLines } from '../components/OrderLines';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { Toast } from '../components/Toast';
import { formatDateTime } from '../lib/format';
import { allowedTargets } from '../lib/transitions';
import { NotFoundPage } from './NotFoundPage';
import { useOrder } from './useOrder';

const NUMBER = /^ORD-\d{6}$/;
const actionLabel: Record<OrderTarget, string> = {
  paid: 'Mark paid',
  shipped: 'Mark shipped',
  cancelled: 'Cancel',
};
const doneLabel: Record<OrderTarget, string> = {
  paid: 'paid',
  shipped: 'shipped',
  cancelled: 'cancelled',
};

/** `/orders/:number`: the order, its allowed actions and its history. */
export function OrderDetailPage() {
  const { number = '' } = useParams();
  if (!NUMBER.test(number)) return <NotFoundPage />;
  return <OrderDetail number={number} />;
}

function OrderDetail({ number }: { number: string }) {
  const location = useLocation();
  const fromSearch = (location.state as { fromSearch?: unknown } | null)?.fromSearch;
  const back = `/${typeof fromSearch === 'string' && fromSearch.startsWith('?') ? fromSearch : ''}`;

  const { data, reload, replace } = useOrder(number);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [conflict, setConflict] = useState(false);
  const [failed, setFailed] = useState<{ to: OrderTarget; reason?: string } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (data.status === 'not-found') return <NotFoundPage />;
  if (data.status === 'error') {
    return (
      <>
        <h1 className="mono">{number}</h1>
        <ErrorRetry message="Can't load the order." onRetry={reload} />
      </>
    );
  }
  if (data.status === 'loading') {
    return (
      <>
        <h1 className="mono">{number}</h1>
        <section aria-busy="true">
          <Spinner label="Loading order…" />
        </section>
      </>
    );
  }
  const order: Order = data.order;

  async function submit(to: OrderTarget, reason?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(null);
    setReasonError(null);
    setDialogError(null);
    try {
      const updated = await changeStatus(number, {
        to,
        version: order.version,
        ...(reason ? { reason } : {}),
      });
      replace(updated);
      setDialogOpen(false);
      setToast(`Order ${number} marked as ${doneLabel[to]}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setDialogOpen(false);
        setConflict(true);
      } else if (e instanceof ApiError && e.status === 422) {
        setReasonError('The reason is not valid: use at most 500 characters.');
      } else if (e instanceof ApiError && e.status === 401) {
        // the client already sent the user to login
      } else if (dialogOpen) {
        setDialogError("Couldn't cancel the order. Try again.");
      } else {
        setFailed({ to, ...(reason ? { reason } : {}) });
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const targets = allowedTargets(order.status);
  const disabled = conflict;

  return (
    <>
      <Link to={back} className="page-link back-link">
        Back to orders
      </Link>
      <div className="detail-head">
        <h1 className="mono">{order.number}</h1>
        <StatusBadge status={order.status} />
        <div className="detail-actions">
          {targets.map((to) =>
            to === 'cancelled' ? (
              <Button
                key={to}
                variant="danger"
                disabled={disabled}
                busy={busy && !dialogOpen}
                onClick={() => {
                  setDialogOpen(true);
                }}
              >
                {actionLabel[to]}
              </Button>
            ) : (
              <Button key={to} disabled={disabled} busy={busy} onClick={() => void submit(to)}>
                {actionLabel[to]}
              </Button>
            ),
          )}
        </div>
      </div>
      {targets.length === 0 && <p className="muted">This order is final: no more changes.</p>}

      {conflict && (
        <div className="panel panel-error" role="alert">
          <span>This order changed: reload.</span>
          <Button
            variant="secondary"
            onClick={() => {
              setConflict(false);
              reload();
            }}
          >
            Reload
          </Button>
        </div>
      )}
      {failed && (
        <ErrorRetry
          message="Couldn't change the status."
          onRetry={() => void submit(failed.to, failed.reason)}
        />
      )}

      <section aria-labelledby="sec-customer" className="detail-section">
        <h2 id="sec-customer">Customer</h2>
        <p>
          {order.customer.name}
          <br />
          {order.customer.email}
        </p>
      </section>

      <section aria-labelledby="sec-address" className="detail-section">
        <h2 id="sec-address">Shipping address</h2>
        <address>
          {order.shippingAddress.name}
          <br />
          {order.shippingAddress.line1}
          <br />
          {order.shippingAddress.line2 && (
            <>
              {order.shippingAddress.line2}
              <br />
            </>
          )}
          {order.shippingAddress.postalCode} {order.shippingAddress.city}
          <br />
          {order.shippingAddress.country}
        </address>
      </section>

      <section aria-labelledby="sec-items" className="detail-section">
        <h2 id="sec-items">Items</h2>
        <OrderLines order={order} />
      </section>

      <section aria-labelledby="sec-history" className="detail-section">
        <h2 id="sec-history">History</h2>
        {order.history.length === 0 ? (
          <p className="muted">No status changes yet</p>
        ) : (
          <ol className="history">
            {order.history.map((h) => (
              <li key={`${h.at}-${h.to}`}>
                <div>
                  <strong>{h.to.charAt(0).toUpperCase() + h.to.slice(1)}</strong> ·{' '}
                  {h.changedBy.name} · {formatDateTime(h.at)}
                </div>
                <div className="muted">from {h.from}</div>
                {h.reason && <q className="reason">{h.reason}</q>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <CancelDialog
        open={dialogOpen}
        number={order.number}
        busy={busy}
        fieldError={reasonError}
        error={dialogError}
        onConfirm={(reason) => void submit('cancelled', reason.trim())}
        onClose={() => {
          setDialogOpen(false);
          setReasonError(null);
          setDialogError(null);
        }}
      />
      <Toast
        message={toast}
        onDone={() => {
          setToast(null);
        }}
      />
    </>
  );
}
