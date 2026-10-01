import { useState } from 'react';
import type { Block } from '@mixboard/shared';
import { fileUrl } from '../api/client';
import { imageLabel } from '../canvas/mapping';
import { ClarificationForm } from './ClarificationForm';
import { Markdown } from './Markdown';
import { lastUserText } from './reducer';
import type { useChat } from './useChat';

/**
 * The chat side panel.
 * Precondition: `chat` comes from useChat for the current board; `blockCount` is the number of blocks on the board;
 * `selected` are the selected blocks in selection order (they go to the agent with the next message).
 * Postcondition: shows history, streamed status, replies with chips, and clarification forms; after an error (and while idle) a Retry button re-sends the last user message; Enter sends (Shift+Enter adds a line). The selected blocks show as thumbnails inside the message box, above the text, as in Mixboard (GitHub #9). On an empty board the agent has not answered yet, messages (including Retry) use the onboarding shortcut.
 */
export function ChatPanel({ chat, blockCount, onFocusBlock, selected = [] }: {
  chat: ReturnType<typeof useChat>;
  blockCount: number;
  onFocusBlock(blockId: string): void;
  selected?: Block[];
}) {
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
      <div className="composer">
        {selected.length > 0 && (
          <ul className="composer-selection" aria-label="Selected blocks sent with your message">
            {selected.map((b) => <li key={b.id}><SelectionThumb block={b} /></li>)}
          </ul>
        )}
        <textarea
          value={draft}
          placeholder="Ask Mixboard…"
          rows={3}
          disabled={state.running}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        />
      </div>
    </div>
  );
}

/**
 * One selected block in the message box: the image itself, or a "T" tile for a text block (or an image still without a file).
 * Precondition: `block` is a block on the current board.
 * Postcondition: renders a small square titled with the block's label (caption title or name).
 */
function SelectionThumb({ block }: { block: Block }) {
  const label = block.type === 'image' ? imageLabel(block) : block.name || 'Text';
  const image = block.type === 'image' ? block.resources.find((r) => r.kind === 'image') : undefined;
  return image
    ? <img className="thumb" src={fileUrl(image.id)} alt={label} title={label} />
    : <span className="thumb text" role="img" aria-label={label} title={label}>T</span>;
}
