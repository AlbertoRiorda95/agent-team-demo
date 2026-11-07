import type { components } from '../api/schema';

export type OrderStatus = components['schemas']['OrderStatus'];

const labels: Record<OrderStatus, string> = {
  new: 'New',
  paid: 'Paid',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
};

/** The order status as text on a colored badge (text is always shown). */
export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge badge-${status}`}>{labels[status]}</span>;
}
