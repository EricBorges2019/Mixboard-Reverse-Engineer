// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatPanel } from '../src/chat/ChatPanel';
import type { ChatState } from '../src/chat/reducer';
import type { Block } from '@mixboard/shared';

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
  it('retries a failed first message on an empty board with the onboarding shortcut', () => {
    const send = vi.fn(async () => {});
    const s = state({ items: [{ kind: 'user', text: 'a town' }, { kind: 'error', text: 'boom' }] });
    render(<ChatPanel chat={chatWith(s, send)} blockCount={0} onFocusBlock={() => {}} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' }).at(-1)!);
    expect(send).toHaveBeenCalledWith('a town', 3);
  });
  it('shows selected blocks inside the message box, in selection order, and nothing when none are selected', () => {
    const block = (id: string, type: Block['type'], name: string, resources: unknown[] = []) =>
      ({ id, type, name, resources, rect: { x: 0, y: 0, w: 10, h: 10 } }) as unknown as Block;
    const room = block('b2', 'image', 'living-room.jpg', [{ id: 'r2', kind: 'image', caption: { title: 'Bright living room' } }]);
    const garland = block('b1', 'image', 'Window garland', [{ id: 'r1', kind: 'image', caption: null }]);
    const note = block('b3', 'text', '');
    const { rerender } = render(<ChatPanel chat={chatWith(state({}))} blockCount={3} onFocusBlock={() => {}} selected={[garland, room, note]} />);
    const list = screen.getByRole('list', { name: /Selected blocks/ });
    const thumbs = Array.from(list.querySelectorAll('[title]'));
    expect(thumbs.map((t) => t.getAttribute('title'))).toEqual(['Window garland', 'Bright living room', 'Text']);
    expect(screen.getByAltText('Bright living room').getAttribute('src')).toBe('/api/files/r2');
    expect(list.closest('.composer')!.contains(screen.getByPlaceholderText('Ask Mixboard…'))).toBe(true);
    rerender(<ChatPanel chat={chatWith(state({}))} blockCount={3} onFocusBlock={() => {}} selected={[]} />);
    expect(screen.queryByRole('list', { name: /Selected blocks/ })).toBeNull();
  });
});
