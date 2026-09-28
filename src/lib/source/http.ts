/** Small fetch helpers: timeouts, retries with exponential backoff, concurrency. */

export interface RetryOptions {
  timeoutMs: number;
  retries: number;
  baseDelayMs: number;
  log?: (msg: string) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOptions,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      // Retry on throttling and transient server errors only.
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
      } else {
        return res;
      }
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
    }
    if (attempt < opts.retries) {
      const delay = opts.baseDelayMs * 2 ** attempt + Math.floor(Math.random() * opts.baseDelayMs);
      opts.log?.(`retry ${attempt + 1}/${opts.retries} in ${delay}ms: ${url} (${String(lastErr)})`);
      await sleep(delay);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Run tasks with bounded concurrency, preserving input order in results. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
