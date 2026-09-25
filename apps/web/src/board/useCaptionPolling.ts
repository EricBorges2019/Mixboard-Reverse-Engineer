import { useEffect, useRef } from 'react';
import type { Block } from '@mixboard/shared';
import { getBoard } from '../api/client';
import { captionKey } from '../canvas/mapping';

/**
 * Polls for captions that the server generates in the background.
 * Precondition: `blocks` is the client's current block list.
 * Postcondition: while any finished image lacks a caption, the board is re-fetched every 3 s (at most 40 times, about two minutes); `onBlock` is called for every block whose caption changed. Fetch errors are ignored and retried on the next tick.
 */
export function useCaptionPolling(boardId: string, blocks: Block[], onBlock: (block: Block) => void): void {
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const onBlockRef = useRef(onBlock);
  onBlockRef.current = onBlock;
  const pending = blocks.some((b) => b.type === 'image' && b.status === 'ready' && b.resources.some((r) => r.kind === 'image' && !r.caption));
  useEffect(() => {
    if (!pending) return;
    let ticks = 0;
    const timer = setInterval(async () => {
      if (++ticks > 40) {
        clearInterval(timer);
        return;
      }
      try {
        const fresh = await getBoard(boardId);
        for (const b of fresh.blocks) {
          const old = blocksRef.current.find((x) => x.id === b.id);
          if (old && captionKey(old) !== captionKey(b)) onBlockRef.current(b);
        }
      } catch {
        /* transient; try again on the next tick */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [pending, boardId]);
}
