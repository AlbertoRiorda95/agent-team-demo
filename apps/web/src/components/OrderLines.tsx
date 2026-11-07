import type { Order } from '../api/client';
import { formatAmount, sumAmounts } from '../lib/format';
import { useWide } from '../lib/useWide';

/** The lines and totals of an order: a table from `--bp-md`, stacked blocks below. */
export function OrderLines({ order }: { order: Order }) {
  const wide = useWide();
  const subtotal = sumAmounts(
    order.items.map((l) => l.lineTotal),
    order.currency,
  );
  return (
    <>
      {wide ? (
        <table className="orders-table" aria-label="Items">
          <thead>
            <tr>
              <th scope="col">SKU</th>
              <th scope="col">Name</th>
              <th scope="col" className="amount">
                Quantity
              </th>
              <th scope="col" className="amount">
                Unit price
              </th>
              <th scope="col" className="amount">
                Line total
              </th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((l) => (
              <tr key={l.sku}>
                <td className="mono">{l.sku}</td>
                <td>{l.name}</td>
                <td className="amount">{l.quantity}</td>
                <td className="amount">{formatAmount(l.unitPrice)}</td>
                <td className="amount">{formatAmount(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="cards" aria-label="Items">
          {order.items.map((l) => (
            <li key={l.sku} className="card">
              <div className="mono">{l.sku}</div>
              <div>{l.name}</div>
              <div className="card-meta">
                <span>
                  {l.quantity} × {formatAmount(l.unitPrice)}
                </span>
                <span className="amount">{formatAmount(l.lineTotal)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <dl className="totals">
        <dt>Items subtotal</dt>
        <dd className="amount">{formatAmount(subtotal)}</dd>
        <dt>Shipping</dt>
        <dd className="amount">{formatAmount(order.shippingCost)}</dd>
        <dt className="total-row">Total</dt>
        <dd className="amount total-row">{formatAmount(order.total)}</dd>
      </dl>
    </>
  );
}
