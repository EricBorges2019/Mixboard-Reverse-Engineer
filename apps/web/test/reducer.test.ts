import { describe, it, expect } from 'vitest';
import type { AgentEvent } from '@mixboard/shared';
import { chatReducer, initialChatState, lastUserText, type ChatState } from '../src/chat/reducer';

const ev = (event: AgentEvent) => ({ type: 'event' as const, event });
const run = (actions: Parameters<typeof chatReducer>[1][], from: ChatState = initialChatState) => actions.reduce(chatReducer, from);

describe('chatReducer', () => {
  it('adds the user message and starts running', () => {
    const s = run([{ type: 'send', text: 'hi' }]);
    expect(s).toMatchObject({ running: true, status: null, items: [{ kind: 'user', text: 'hi' }] });
  });
  it('shows fixed tool labels without a tagline', () => {
    const s = run([{ type: 'send', text: 'x' }, ev({ type: 'tool_call', id: '1', name: 'create_image_block', args: {} })]);
    expect(s.status).toBe('Creating image...');
  });
  it('locks the tagline over later tool labels (puns on)', () => {
    const s = run([
      { type: 'send', text: 'x' },
      ev({ type: 'tagline', text: 'Paws-ing to fetch!' }),
      ev({ type: 'tool_call', id: '1', name: 'load_skill', args: {} }),
    ]);
    expect(s.status).toBe('Paws-ing to fetch!');
  });
  it('appends assistant text, errors and clarification forms; done stops the run', () => {
    const q = [{ question: 'Focus?', suggestions: ['a', 'b', 'c', 'd'] }];
    const s = run([
      { type: 'send', text: 'x' },
      ev({ type: 'clarification', questions: q }),
      ev({ type: 'text', text: 'Done' }),
      ev({ type: 'error', message: 'boom' }),
      ev({ type: 'done' }),
    ]);
    expect(s.items.map((i) => i.kind)).toEqual(['user', 'clarification', 'assistant', 'error']);
    expect(s).toMatchObject({ running: false, status: null });
  });
  it('marks open clarification forms answered when the user replies', () => {
    const q = [{ question: 'Focus?', suggestions: ['a', 'b', 'c', 'd'] }];
    const s = run([ev({ type: 'clarification', questions: q }), { type: 'send', text: 'a' }]);
    expect(s.items[0]).toMatchObject({ kind: 'clarification', answered: true });
  });
  it('finds the last user message for Retry', () => {
    expect(lastUserText([])).toBeNull();
    expect(lastUserText([{ kind: 'user', text: 'a' }, { kind: 'assistant', text: 'b' }, { kind: 'user', text: 'c' }, { kind: 'error', text: 'x' }])).toBe('c');
  });
  it('replaces items from history and reports transport failures as errors', () => {
    const s = run([{ type: 'history', items: [{ kind: 'assistant', text: 'old' }] }, { type: 'send', text: 'x' }, { type: 'failed', message: 'offline' }]);
    expect(s.items.at(-1)).toEqual({ kind: 'error', text: 'offline' });
    expect(s.running).toBe(false);
  });
});
