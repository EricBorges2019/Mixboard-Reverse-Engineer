import { z } from 'zod';
import { plainTextToDoc, wrapTextContent } from '@mixboard/shared';
import { defineTool, type ToolDef } from '../skills/registry';
import { getBoardBlock } from './shared';

export const textTools: ToolDef[] = [
  defineTool({
    name: 'create_text_block',
    description: 'Create a text block on the canvas.',
    schema: z.object({
      generated_text_content: z.string().min(1),
      x: z.number().default(0),
      y: z.number().default(0),
      width: z.number().positive().default(350),
      height: z.number().positive().default(100),
      name: z.string().default(''),
    }),
    /**
     * Creates a text block holding the given text.
     * Precondition: arguments are validated.
     * Postcondition: a text block with a wrapped rich-text resource exists, a `block` event was emitted, and `{block_id, name}` is returned.
     */
    async run(a, ctx) {
      const block = ctx.repo.createBlock(ctx.boardId, { type: 'text', name: a.name, rect: { x: a.x, y: a.y, w: a.width, h: a.height } });
      ctx.repo.updateTextContent(block.id, wrapTextContent(plainTextToDoc(a.generated_text_content)));
      ctx.emit({ type: 'block', block: ctx.repo.getBlock(block.id), isPlaceholder: false });
      return { block_id: block.id, name: block.name };
    },
  }),
  defineTool({
    name: 'update_text_block',
    description: 'Replace the text of an existing text block.',
    schema: z.object({ update_block_id: z.string(), generated_text_content: z.string().min(1) }),
    /**
     * Replaces a text block's content.
     * Precondition: the block exists on this board and is a text block.
     * Postcondition: the content is replaced, a `block` event was emitted, and `{block_id, name}` is returned; throws otherwise.
     */
    async run(a, ctx) {
      const block = getBoardBlock(ctx, a.update_block_id, 'text');
      ctx.repo.updateTextContent(block.id, wrapTextContent(plainTextToDoc(a.generated_text_content)));
      ctx.emit({ type: 'block', block: ctx.repo.getBlock(block.id), isPlaceholder: false });
      return { block_id: block.id, name: block.name };
    },
  }),
];
