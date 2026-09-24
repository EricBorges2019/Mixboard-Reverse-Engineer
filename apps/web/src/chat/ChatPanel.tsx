import { useEffect, useState } from 'react';
import { blockRef } from '@mixboard/shared';
import { ClarificationForm } from './ClarificationForm';
import { Markdown } from './Markdown';
import { lastUserText } from './reducer';
import type { useChat } from './useChat';

/**
 * The chat side panel.
 * Precondition: `chat` comes from useChat for the current board; `blockCount` is the number of blocks on the board.
 * Postcondition: shows history, streamed status, replies with chips, and clarification forms; after an error (and while idle) a Retry button re-sends the last user message; Enter sends (Shift+Enter adds a line). On an empty board the agent has not answered yet, messages (including Retry) use the onboarding shortcut. A `mb:regenerate` window event from an errored image block sends a regenerate request for that block.
 */
export function ChatPanel({ chat, blockCount, onFocusBlock }: { chat: ReturnType<typeof useChat>; blockCount: number; onFocusBlock(blockId: string): void }) {
  const { state, send } = chat;
  const [draft, setDraft] = useState('');
  // No agent reply yet: a failed first attempt still counts as the onboarding turn, so Retry keeps the shortcut.
  const isEmptyBoard = blockCount === 0 && !state.items.some((i) => i.kind === 'assistant' || i.kind === 'clarification');
  const retryText = lastUserText(state.items);

  /**
   * Sends the draft.
   * Precondition: none.
   * Postcondition: a non-blank draft is sent (with the onboarding shortcut on an empty board) and cleared.
   */
  function submit(): void {
    if (!draft.trim() || state.running) return;
    void send(draft, isEmptyBoard ? 3 : undefined);
    setDraft('');
  }

  useEffect(() => {
    /**
     * Handles the Regenerate button of a failed image block.
     * Precondition: `e` is a CustomEvent with `{blockId, name}` detail.
     * Postcondition: a regenerate request naming the block is sent.
     */
    function onRegenerate(e: Event): void {
      const { blockId, name } = (e as CustomEvent<{ blockId: string; name: string }>).detail;
      void send(`Regenerate ${blockRef(blockId, name || 'this image')}`);
    }
    window.addEventListener('mb:regenerate', onRegenerate);
    return () => window.removeEventListener('mb:regenerate', onRegenerate);
  }, [send]);

  return (
    <div className="chat">
      <div className="chat-items">
        {state.items.map((item, i) =>
          item.kind === 'clarification' ? (
            <ClarificationForm key={i} questions={item.questions} disabled={item.answered || state.running} onSubmit={(m) => void send(m)} />
          ) : item.kind === 'assistant' ? (
            <div key={i} className="msg assistant"><Markdown text={item.text} onRefClick={onFocusBlock} /></div>
          ) : (
            <div key={i} className={`msg ${item.kind}`}>{item.text}</div>
          ),
        )}
        {state.running && <div className="status" role="status">{state.status ?? 'Thinking…'}</div>}
        {!state.running && state.items.at(-1)?.kind === 'error' && retryText !== null && (
          <button className="retry" onClick={() => void (isEmptyBoard ? send(retryText, 3) : send(retryText))}>Retry</button>
        )}
      </div>
      <textarea
        value={draft}
        placeholder="Ask Mixboard…"
        rows={3}
        disabled={state.running}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
      />
    </div>
  );
}
