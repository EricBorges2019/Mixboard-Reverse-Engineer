import type { Block } from '@mixboard/shared';
import type { ToolContext } from '../types';

/**
 * Loads a block and checks it belongs to the current board (and type, if given).
 * Precondition: `ctx.repo` and `ctx.boardId` are set.
 * Postcondition: returns the block; throws NotFoundError for an unknown id, or Error when the block is on another board or of the wrong type. The loop returns thrown errors to the model as tool errors.
 */
export function getBoardBlock(ctx: ToolContext, id: string, type?: 'text' | 'image'): Block {
  const block = ctx.repo.getBlock(id);
  if (block.boardId !== ctx.boardId) throw new Error(`Block ${id} is not on this board.`);
  if (type && block.type !== type) throw new Error(`Block ${id} is not a ${type} block.`);
  return block;
}
