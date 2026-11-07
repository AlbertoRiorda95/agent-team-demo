import type { OrderStatus } from '../components/StatusBadge';
import type { OrderTarget } from '../api/client';

/** The statuses an order can move to from `status` (shipped and cancelled are final). */
export function allowedTargets(status: OrderStatus): OrderTarget[] {
  if (status === 'new') return ['paid', 'cancelled'];
  if (status === 'paid') return ['shipped', 'cancelled'];
  return [];
}
