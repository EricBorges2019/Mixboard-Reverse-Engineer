// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatPanel } from '../src/chat/ChatPanel';
import type { ChatState } from '../src/chat/reducer';

const state = (over: Partial<ChatState>): ChatState => ({ items: [], running: false, status: null, statusLocked: false, ...over });
const chatWith = (s: ChatState, send = vi.fn(async () => {})) => ({ state: s, send }) as never;

describe('ChatPanel', () => {
  it('offers Retry after an error and re-sends the last user message', () => {
    const send = vi.fn(async () => {});
    const s = state({ items: [{ kind: 'user', text: 'make dragons' }, { kind: 'error', text: 'boom' }] });
    render(<ChatPanel chat={chatWith(s, send)} blockCount={1} onFocusBlock={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(send).toHaveBeenCalledWith('make dragons');
  });
  it('shows no Retry while running or when the last item is not an error', () => {
    const items = [{ kind: 'user' as const, text: 'x' }, { kind: 'error' as const, text: 'boom' }];
    const { rerender } = render(<ChatPanel chat={chatWith(state({ items, running: true }))} blockCount={1} onFocusBlock={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    rerender(<ChatPanel chat={chatWith(state({ items: [...items, { kind: 'assistant', text: 'ok' }] }))} blockCount={1} onFocusBlock={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
  it('uses the onboarding shortcut only for the first message on an empty board', () => {
    const send = vi.fn(async () => {});
    render(<ChatPanel chat={chatWith(state({}), send)} blockCount={0} onFocusBlock={() => {}} />);
    const box = screen.getByPlaceholderText('Ask Mixboard…');
    fireEvent.change(box, { target: { value: 'a fantasy town' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith('a fantasy town', 3);
  });
});
