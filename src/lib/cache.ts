type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** Process-local TTL cache with single-flight, so a scan of 40 instruments
 *  doesn't fire 40 duplicate upstream requests. */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const p = (async () => {
    try {
      const value = await fn();
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export function peek<T>(key: string): T | undefined {
  const hit = store.get(key);
  return hit && hit.expires > Date.now() ? (hit.value as T) : undefined;
}

export function drop(prefix: string) {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}

export async function fetchJson<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs = 12_000, ...rest } = init ?? {};
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: ctl.signal,
      cache: "no-store",
      headers: {
        // Several of these hosts reject the default fetch agent outright.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
        ...(rest.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 90)}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
