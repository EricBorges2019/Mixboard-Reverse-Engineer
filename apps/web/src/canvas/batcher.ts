/**
 * Collects keyed values and flushes them together after a quiet period (debounce), so dragging a block sends one patch and not hundreds.
 * Precondition: `delayMs` is non-negative; `merge` (default: last write wins) combines two values queued under one key.
 * Postcondition: returns `queue` (schedule a value; restarts nothing if a timer is already running) and `flushNow` (flush immediately; no-op when empty). `flush` receives each key's merged value exactly once.
 */
export function createBatcher<T>(
  flush: (items: Map<string, T>) => void,
  delayMs: number,
  merge: (prev: T, next: T) => T = (_prev, next) => next,
): { queue(key: string, value: T): void; flushNow(): void } {
  let pending = new Map<string, T>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Sends and clears everything pending.
   * Precondition: none.
   * Postcondition: the timer is cleared; `flush` was called once if anything was pending.
   */
  function flushNow(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pending.size === 0) return;
    const items = pending;
    pending = new Map();
    flush(items);
  }
  /**
   * Queues a value under a key.
   * Precondition: none.
   * Postcondition: the value is merged with any pending value for `key` and a flush is scheduled if none is.
   */
  function queue(key: string, value: T): void {
    pending.set(key, pending.has(key) ? merge(pending.get(key) as T, value) : value);
    timer ??= setTimeout(flushNow, delayMs);
  }
  return { queue, flushNow };
}
