import { z } from 'zod';
import { defineTool, type ToolDef } from '../skills/registry';
import { getBoardBlock } from './shared';

export const boardTools: ToolDef[] = [
  defineTool({
    name: 'set_board_title',
    description: 'Set the title of the current board.',
    schema: z.object({ title: z.string().trim().min(1) }),
    /**
     * Renames the current board.
     * Precondition: `title` is non-empty (validated).
     * Postcondition: the board title is stored; returns `Board title set to: <title>`.
     */
    async run({ title }, ctx) {
      ctx.repo.updateBoard(ctx.boardId, { title });
      return `Board title set to: ${title}`;
    },
  }),
  defineTool({
    name: 'delete_block',
    description: 'Permanently delete a block from the board. Only use when the user asks.',
    schema: z.object({ block_id: z.string() }),
    /**
     * Deletes a block from the current board.
     * Precondition: the block exists on the current board.
     * Postcondition: the block and its files are gone and a `block_deleted` event was emitted; throws (nothing deleted) otherwise.
     */
    async run({ block_id }, ctx) {
      getBoardBlock(ctx, block_id);
      ctx.repo.deleteBlock(block_id);
      ctx.emit({ type: 'block_deleted', blockId: block_id });
      return `Deleted block ${block_id}.`;
    },
  }),
];
