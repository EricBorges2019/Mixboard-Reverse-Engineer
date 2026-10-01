import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { createBatcher } from '../src/canvas/batcher';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('createBatcher', () => {
  it('flushes once after the delay with the latest value per key', () => {
    const flush = vi.fn();
    const b = createBatcher<number>(flush, 100);
    b.queue('a', 1);
    b.queue('a', 2);
    b.queue('b', 3);
    vi.advanceTimersByTime(99);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
    expect([...flush.mock.calls[0][0]]).toEqual([['a', 2], ['b', 3]]);
  });
  it('merges values for the same key when a merge function is given', () => {
    const flush = vi.fn();
    const b = createBatcher<{ x?: number; y?: number }>(flush, 100, (p, n) => ({ ...p, ...n }));
    b.queue('k', { x: 1 });
    b.queue('k', { y: 2 });
    b.flushNow();
    expect([...flush.mock.calls[0][0]]).toEqual([['k', { x: 1, y: 2 }]]);
  });
  it('flushNow sends immediately, cancels the timer and does nothing when empty', () => {
    const flush = vi.fn();
    const b = createBatcher<number>(flush, 100);
    b.flushNow();
    expect(flush).not.toHaveBeenCalled();
    b.queue('a', 1);
    b.flushNow();
    vi.advanceTimersByTime(500);
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
