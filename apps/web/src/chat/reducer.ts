import type { AgentEvent, ClarificationQuestion } from '@mixboard/shared';
import { statusLabel } from './status';

export type ChatItem =
  | { kind: 'user' | 'assistant' | 'error'; text: string }
  | { kind: 'clarification'; questions: ClarificationQuestion[]; answered: boolean };

export interface ChatState {
  items: ChatItem[];
  running: boolean;
  status: string | null;
  /** True once a tagline was shown: it stays for the whole run instead of tool labels (puns on). */
  statusLocked: boolean;
}

export type ChatAction =
  | { type: 'history'; items: ChatItem[] }
  | { type: 'send'; text: string }
  | { type: 'event'; event: AgentEvent }
  | { type: 'failed'; message: string };

export const initialChatState: ChatState = { items: [], running: false, status: null, statusLocked: false };

/**
 * Text of the most recent user message (what Retry re-sends).
 * Precondition: none.
 * Postcondition: returns the text, or null when the user has not written anything yet.
 */
export function lastUserText(items: ChatItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === 'user') return item.text;
  }
  return null;
}

/**
 * Chat panel state transition.
 * Precondition: `state` came from initialChatState or a previous call.
 * Postcondition: returns a new state; never mutates `state`. `send` adds the user message, starts a run and closes open clarification forms. `event` maps agent events to items and status (tagline locks the status; `done` ends the run). `block`, `block_deleted`, `tool_result` events do not change chat state (the canvas handles them).
 */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'history':
      return { ...state, items: action.items };
    case 'send':
      return {
        items: [...state.items.map((i) => (i.kind === 'clarification' ? { ...i, answered: true } : i)), { kind: 'user', text: action.text }],
        running: true, status: null, statusLocked: false,
      };
    case 'failed':
      return { ...state, items: [...state.items, { kind: 'error', text: action.message }], running: false, status: null, statusLocked: false };
    case 'event': {
      const e = action.event;
      switch (e.type) {
        case 'tagline': return { ...state, status: e.text, statusLocked: true };
        case 'tool_call': return state.statusLocked ? state : { ...state, status: statusLabel(e.name) };
        case 'text': return { ...state, items: [...state.items, { kind: 'assistant', text: e.text }] };
        case 'error': return { ...state, items: [...state.items, { kind: 'error', text: e.message }] };
        case 'clarification': return { ...state, items: [...state.items, { kind: 'clarification', questions: e.questions, answered: false }] };
        case 'done': return { ...state, running: false, status: null, statusLocked: false };
        default: return state;
      }
    }
  }
}
