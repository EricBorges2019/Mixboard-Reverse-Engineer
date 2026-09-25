/**
 * Collects keyed values and flushes them together after a quiet period (debounce), so dragging a block sends one patch and not hundreds.
 * Precondition: `delayMs` is non-negative; `merge` (default: last write wins) combines two values queued under one key.
 * Postcondition: returns `queue` (schedule a value; restarts nothing if a timer is already running), `flushNow` (flush immediately; no-op when empty), `cancel` (drop one key) and `has` (is a key pending). `flush` receives each key's merged value exactly once.
 */
export function createBatcher<T>(
  flush: (items: Map<string, T>) => void,
  delayMs: number,
  merge: (prev: T, next: T) => T = (_prev, next) => next,
): { queue(key: string, value: T): void; flushNow(): void; cancel(key: string): void; has(key: string): boolean } {
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
  /**
   * Drops a pending value, for example when its block was deleted.
   * Precondition: none.
   * Postcondition: nothing is pending under `key`; other keys are untouched.
   */
  function cancel(key: string): void {
    pending.delete(key);
  }
  /**
   * Tells whether a value is waiting to be sent under a key.
   * Precondition: none.
   * Postcondition: returns true while a value for `key` is pending.
   */
  function has(key: string): boolean {
    return pending.has(key);
  }
  return { queue, flushNow, cancel, has };
}
