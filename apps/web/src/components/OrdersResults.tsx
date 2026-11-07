import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { OrderSummary } from '../api/client';
import { formatAmount, formatDateTime } from '../lib/format';
import { StatusBadge } from './StatusBadge';

/** True from the `--bp-md` token width up (the table); below it the cards are shown. */
function useWide(): boolean {
  const query = () => {
    const bp = getComputedStyle(document.documentElement).getPropertyValue('--bp-md').trim();
    return `(min-width: ${bp || '768px'})`;
  };
  const get = () => (typeof matchMedia === 'function' ? matchMedia(query()).matches : true);
  const [wide, setWide] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query());
    const on = () => {
      setWide(mq.matches);
    };
    on();
    mq.addEventListener('change', on);
    return () => {
      mq.removeEventListener('change', on);
    };
  }, []);
  return wide;
}

/** The orders of one page: a table from `--bp-md`, cards below. Presentational. */
export function OrdersResults({ items }: { items: OrderSummary[] }) {
  const wide = useWide();
  if (!wide) {
    return (
      <ul className="cards">
        {items.map((o) => (
          <li key={o.number} className="card">
            <div className="card-head">
              <Link to={`/orders/${o.number}`} className="order-number">
                {o.number}
              </Link>
              <StatusBadge status={o.status} />
            </div>
            <div>{o.customerName}</div>
            <div className="card-meta">
              <span>{formatDateTime(o.createdAt)}</span>
              <span className="amount">{formatAmount(o.total)}</span>
            </div>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <table className="orders-table" aria-label="Orders">
      <thead>
        <tr>
          <th scope="col">Number</th>
          <th scope="col">Date</th>
          <th scope="col">Customer</th>
          <th scope="col">Status</th>
          <th scope="col" className="amount">
            Total
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((o) => (
          <tr key={o.number}>
            <td>
              <Link to={`/orders/${o.number}`} className="order-number">
                {o.number}
              </Link>
            </td>
            <td>{formatDateTime(o.createdAt)}</td>
            <td>{o.customerName}</td>
            <td>
              <StatusBadge status={o.status} />
            </td>
            <td className="amount">{formatAmount(o.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
