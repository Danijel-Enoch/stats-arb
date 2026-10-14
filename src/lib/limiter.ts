/**
 * Minimum-interval gate per upstream host. Yahoo in particular answers a cold
 * burst of 40 symbols with 429s, so requests to it are spaced out and retried
 * with backoff rather than fired all at once.
 */
const last = new Map<string, number>();
const chain = new Map<string, Promise<void>>();

export function gate<T>(key: string, minIntervalMs: number, fn: () => Promise<T>): Promise<T> {
  const prev = chain.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  chain.set(key, prev.then(() => mine));

  return prev.then(async () => {
    const since = Date.now() - (last.get(key) ?? 0);
    const wait = Math.max(0, minIntervalMs - since);
    if (wait > 0) await sleep(wait);
    last.set(key, Date.now());
    try {
      return await fn();
    } finally {
      release();
    }
  });
}

export async function retrying<T>(
  attempts: number,
  fn: (attempt: number) => Promise<T>,
  shouldRetry: (e: unknown) => boolean = () => true,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (e) {
      lastErr = e;
      if (i === attempts - 1 || !shouldRetry(e)) break;
      await sleep(350 * 2 ** i + Math.random() * 200);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Circuit breaker. Yahoo answers a burst with 429s for a minute or more at a
 * time; without this, every instrument in a scan pays three doomed retries
 * before falling through to the next provider.
 */
const breakers = new Map<string, { until: number; reason: string }>();

export function tripped(key: string): string | null {
  const b = breakers.get(key);
  if (!b) return null;
  if (Date.now() > b.until) {
    breakers.delete(key);
    return null;
  }
  return b.reason;
}

export function trip(key: string, ms: number, reason: string) {
  breakers.set(key, { until: Date.now() + ms, reason });
}

export function untrip(key: string) {
  breakers.delete(key);
}
