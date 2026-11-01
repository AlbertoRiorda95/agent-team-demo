import type { paths } from './schema';

type Health = paths['/health']['get']['responses'][200]['content']['application/json'];

/** Fetches the service health. Throws when the service is unreachable or not ok. */
export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const res = await fetch('/health', {
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw new Error(`Health check failed (${String(res.status)})`);
  return (await res.json()) as Health;
}
