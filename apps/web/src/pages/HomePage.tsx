import { HealthPanel } from '../HealthPanel';
import { useHealth } from '../useHealth';

/** `/`: the health panel, replaced by the orders list in M2. */
export function HomePage() {
  const { state, retry } = useHealth();
  return (
    <>
      <h1>Orders</h1>
      <HealthPanel state={state} onRetry={retry} />
    </>
  );
}
