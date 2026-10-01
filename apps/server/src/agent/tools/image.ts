import { z } from 'zod';
import { ASPECT_SIZES, AspectRatio, nearestRatio, type Block, type Origin, type OriginAction } from '@mixboard/shared';
import { defineTool, type ToolDef } from '../skills/registry';
import type { ToolContext } from '../types';
import { getBoardBlock } from './shared';

/** `intent` is accepted because the recovered skill file tells the model to send it; it does not change behavior. */
const Intent = z.enum(['create', 'transform', 'variation', 'edit', 'regenerate']);

/**
 * Combines the user prompt with an optional style phrase.
 * Precondition: `prompt` is non-empty.
 * Postcondition: returns `prompt`, or `prompt` plus a `Style:` paragraph when `style` is given.
 */
export function composePrompt(prompt: string, style?: string): string {
  return style ? `${prompt}\n\nStyle: ${style}` : prompt;
}

/**
 * Shortens a prompt to use as a default block name.
 * Precondition: none.
 * Postcondition: returns the prompt unchanged when 40 characters or fewer, otherwise its first 37 characters plus `...`.
 */
function shortName(prompt: string): string {
  return prompt.length > 40 ? `${prompt.slice(0, 37)}...` : prompt;
}

/**
 * Picks the source blocks that count as images for this board: they become reference images and the new block's origin.
 * Precondition: `ids` refer to existing blocks.
 * Postcondition: returns the ids of image blocks on this board, in order and without repeats; text blocks and other boards' blocks are dropped. Throws NotFoundError for unknown ids.
 */
function imageSourceIds(ctx: ToolContext, ids: string[]): string[] {
  return [...new Set(ids)].filter((id) => {
    const block = ctx.repo.getBlock(id);
    return block.boardId === ctx.boardId && block.type === 'image';
  });
}

/**
 * Builds a block origin from its source ids.
 * Precondition: `sourceIds` came from imageSourceIds.
 * Postcondition: returns `{action, sourceBlockIds}`, or null when there are no sources (an image from a prompt alone).
 */
function originFor(action: OriginAction, sourceIds: string[]): Origin | null {
  return sourceIds.length ? { action, sourceBlockIds: sourceIds } : null;
}

/**
 * Turns source image blocks into data-URL reference images.
 * Precondition: `ids` came from imageSourceIds.
 * Postcondition: returns one data URL per block that has a stored file; blocks without files are skipped.
 */
function referenceImages(ctx: ToolContext, ids: string[]): string[] {
  const urls: string[] = [];
  for (const id of ids) {
    const block = ctx.repo.getBlock(id);
    const resource = block.resources.find((r) => r.kind === 'image');
    const file = resource && ctx.repo.readResourceBytes(resource.id);
    if (file) urls.push(`data:${file.mimeType};base64,${file.bytes.toString('base64')}`);
  }
  return urls;
}

/**
 * Creates a `generating` block and announces it as a placeholder.
 * Precondition: `ctx.boardId` exists; `input.origin` lists the image sources (see originFor).
 * Postcondition: the block exists with status `generating` and its origin, and a placeholder `block` event was emitted; returns the block.
 */
function startPlaceholder(ctx: ToolContext, input: { name: string; rect: Block['rect']; prompt: string; aspectRatio: AspectRatio; origin: Origin | null }): Block {
  const block = ctx.repo.createBlock(ctx.boardId, { type: 'image', status: 'generating', ...input });
  ctx.emit({ type: 'block', block, isPlaceholder: true });
  return block;
}

/**
 * Generates an image and stores it in `block`, from what the block records: its prompt (style included), its
 * aspect ratio and its origin sources as reference images. Try again replays the same recipe (imageActions/retry).
 * Precondition: `block` exists, is `generating`, and has a prompt and an aspect ratio (startPlaceholder sets both).
 * Postcondition: on success the block holds the new image, is `ready`, a final `block` event was emitted, captioning was requested, and `{block_id, name}` is returned. On failure the block is `error`, a final `block` event was emitted and `{error}` is returned. An abort is rethrown.
 */
async function generateIntoBlock(ctx: ToolContext, block: Block): Promise<{ block_id: string; name: string } | { error: string }> {
  try {
    const image = await ctx.llm.generateImage({
      model: ctx.models.image,
      prompt: block.prompt!,
      aspectRatio: nearestRatio(block.aspectRatio!, ctx.imageSupportedRatios),
      referenceImages: referenceImages(ctx, block.origin?.sourceBlockIds ?? []),
      signal: ctx.signal,
    });
    const resource = ctx.repo.addResource({ blockId: block.id, kind: 'image', mimeType: image.mimeType, bytes: image.bytes });
    ctx.emit({ type: 'block', block: ctx.repo.setBlockStatus(block.id, 'ready'), isPlaceholder: false });
    ctx.onImageAdded(resource.id);
    return { block_id: block.id, name: block.name };
  } catch (err) {
    if (ctx.signal.aborted) {
      ctx.repo.setBlockStatus(block.id, 'error');
      throw err;
    }
    ctx.emit({ type: 'block', block: ctx.repo.setBlockStatus(block.id, 'error'), isPlaceholder: false });
    return { error: `Image generation failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Edits an existing image block into a new neighbouring block. Mixboard never replaces an image (SPEC §7.3), so the source block is left untouched.
 * Precondition: `targetId` is an image block on this board.
 * Postcondition: see generateIntoBlock; the new block sits 50 px right of the source, its origin is `action` from the source plus any extra image sources, and the source image is always sent as the first reference. Throws when the target is missing, foreign or not an image.
 */
async function editImage(
  ctx: ToolContext,
  a: { action: OriginAction; targetId: string; prompt: string; ratio?: AspectRatio; style?: string; extraSourceIds: string[] },
): Promise<{ block_id: string; name: string } | { error: string }> {
  const target = getBoardBlock(ctx, a.targetId, 'image');
  const ratio = a.ratio ?? target.aspectRatio ?? '1:1';
  const size = a.ratio ? ASPECT_SIZES[a.ratio] : { w: target.rect.w, h: target.rect.h };
  const block = startPlaceholder(ctx, {
    name: `${target.name} (edit)`,
    rect: { x: target.rect.x + target.rect.w + 50, y: target.rect.y, ...size },
    prompt: composePrompt(a.prompt, a.style),
    aspectRatio: ratio,
    origin: originFor(a.action, imageSourceIds(ctx, [target.id, ...a.extraSourceIds])),
  });
  return generateIntoBlock(ctx, block);
}

export const imageTools: ToolDef[] = [
  defineTool({
    name: 'create_image_block',
    description: 'Generate a new image and place it on the canvas as a block.',
    schema: z.object({
      prompt: z.string().min(1),
      aspect_ratio: AspectRatio.default('1:1'),
      style: z.string().optional(),
      source_block_ids: z.array(z.string()).default([]),
      x: z.number().default(0),
      y: z.number().default(0),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      name: z.string().default(''),
      intent: Intent.default('create'),
      remove_background: z.boolean().default(false),
    }),
    /**
     * Creates an image block from a prompt (and optional reference blocks).
     * Precondition: arguments are validated; `source_block_ids` exist.
     * Postcondition: see generateIntoBlock; the placeholder appears before generation starts.
     */
    async run(a, ctx) {
      const base = ASPECT_SIZES[a.aspect_ratio];
      const prompt = a.remove_background ? `${a.prompt}. Isolated subject on a plain transparent background.` : a.prompt;
      const block = startPlaceholder(ctx, {
        name: a.name || shortName(a.prompt),
        rect: { x: a.x, y: a.y, w: a.width ?? base.w, h: a.height ?? base.h },
        prompt: composePrompt(prompt, a.style),
        aspectRatio: a.aspect_ratio,
        origin: originFor('reference', imageSourceIds(ctx, a.source_block_ids)),
      });
      return generateIntoBlock(ctx, block);
    },
  }),
  defineTool({
    name: 'update_image_block',
    description: 'Edit or regenerate an existing image block into a new block next to it.',
    schema: z.object({
      update_block_id: z.string(),
      prompt: z.string().min(1),
      aspect_ratio: AspectRatio.optional(),
      style: z.string().optional(),
      source_block_ids: z.array(z.string()).default([]),
      intent: Intent.default('create'),
      // Accepted because the recovered skill file documents it, but ignored: Mixboard never replaces an image (SPEC §7.3).
      create_new_block_for_update: z.boolean().default(true),
    }),
    /**
     * Edits an image block into a new block.
     * Precondition: `update_block_id` is an image block on this board.
     * Postcondition: see editImage; `create_new_block_for_update: false` still creates a new block.
     */
    async run(a, ctx) {
      return editImage(ctx, { action: 'edit', targetId: a.update_block_id, prompt: a.prompt, ratio: a.aspect_ratio, style: a.style, extraSourceIds: a.source_block_ids });
    },
  }),
  defineTool({
    name: 'remove_background',
    description: 'Remove the background of an image block, producing a new block.',
    schema: z.object({ source_block_id: z.string() }),
    /**
     * Creates a background-free copy of an image block.
     * Precondition: `source_block_id` is an image block on this board.
     * Postcondition: see editImage (always a new block).
     */
    async run({ source_block_id }, ctx) {
      return editImage(ctx, {
        action: 'remove-background',
        targetId: source_block_id,
        prompt: 'Remove the background from this image. Keep the subject exactly as it is, on a plain transparent background.',
        extraSourceIds: [],
      });
    },
  }),
];
