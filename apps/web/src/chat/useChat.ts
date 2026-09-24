import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { AgentEvent } from '@mixboard/shared';
import { runAgent } from '../api/agent';
import { listMessages } from '../api/client';
import { chatReducer, initialChatState, type ChatState } from './reducer';

export interface UseChatOptions {
  projectId: string;
  boardId: string;
  puns: boolean;
  onEvent(event: AgentEvent): void;
  getSelectedBlockIds(): string[];
}

/**
 * Chat state and the `send` action for one board.
 * Precondition: called from a component; `opts.boardId` exists.
 * Postcondition: loads the board's saved history on mount; `send(text, shortcut?)` adds the user message, streams the agent run, feeds every event to both the reducer and `opts.onEvent` (so the canvas can react), and always ends the run (a failed request becomes an error item). Unmounting or switching boards aborts a run in progress.
 */
export function useChat(opts: UseChatOptions): { state: ChatState; send(text: string, shortcut?: 1 | 3): Promise<void> } {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const abortRef = useRef<AbortController | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    let cancelled = false;
    listMessages(opts.boardId)
      .then((items) => { if (!cancelled) dispatch({ type: 'history', items: items.map((m) => ({ kind: m.role, text: m.text })) }); })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [opts.boardId]);

  const send = useCallback(async (text: string, shortcut?: 1 | 3) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const abort = new AbortController();
    abortRef.current = abort;
    dispatch({ type: 'send', text: trimmed });
    const o = optsRef.current;
    try {
      await runAgent(
        { projectId: o.projectId, boardId: o.boardId, message: trimmed, selectedBlockIds: o.getSelectedBlockIds(), shortcut, puns: o.puns },
        (event) => { dispatch({ type: 'event', event }); optsRef.current.onEvent(event); },
        abort.signal,
      );
    } catch (err) {
      if (!abort.signal.aborted) dispatch({ type: 'failed', message: err instanceof Error ? err.message : String(err) });
    } finally {
      dispatch({ type: 'event', event: { type: 'done' } });
    }
  }, []);

  return { state, send };
}
