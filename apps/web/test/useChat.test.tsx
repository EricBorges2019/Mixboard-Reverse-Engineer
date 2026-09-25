// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

let release: () => void = () => {};
vi.mock('../src/api/agent', () => ({ runAgent: vi.fn(() => new Promise<void>((r) => { release = r; })) }));
vi.mock('../src/api/client', () => ({ listMessages: vi.fn(async () => []) }));

import { runAgent } from '../src/api/agent';
import { useChat } from '../src/chat/useChat';

describe('useChat', () => {
  it('ignores a second send while a run is in flight', async () => {
    const { result } = renderHook(() => useChat({ projectId: 'p', boardId: 'b', puns: false, onEvent: () => {}, getSelectedBlockIds: () => [] }));
    let first!: Promise<void>;
    act(() => { first = result.current.send('one'); });
    await act(async () => { await result.current.send('two'); });
    expect(runAgent).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await first; });
    act(() => { void result.current.send('three'); });
    expect(runAgent).toHaveBeenCalledTimes(2);
  });
});
