import { z } from 'zod';
import { ASPECT_SIZES, AspectRatio, nearestRatio, nearestRatioForSize, type Block, type Origin, type OriginAction } from '@mixboard/shared';
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
 * Postcondition: returns, in order, each block that has a stored file with that file as a data URL; blocks without files are skipped.
 */
function referenceImages(ctx: ToolContext, ids: string[]): { block: Block; dataUrl: string }[] {
  const refs: { block: Block; dataUrl: string }[] = [];
  for (const id of ids) {
    const block = ctx.repo.getBlock(id);
    const resource = block.resources.find((r) => r.kind === 'image');
    const file = resource && ctx.repo.readResourceBytes(resource.id);
    if (file) refs.push({ block, dataUrl: `data:${file.mimeType};base64,${file.bytes.toString('base64')}` });
  }
  return refs;
}

/**
 * Tells the image model which attached reference is which. The images arrive as bare attachments, so a prompt like
 * "decorate my living room with these ideas" (GitHub #9) cannot say which one is the room without this list.
 * Each image is named by its caption title when it has one (an upload's block name is often just a filename).
 * Precondition: `refs` are the reference blocks in the order their images are attached.
 * Postcondition: returns `prompt` unchanged for fewer than two references (nothing to tell apart), otherwise
 * `prompt` plus a numbered `Reference images, in the order attached:` list.
 */
export function withReferenceLabels(prompt: string, refs: Block[]): string {
  if (refs.length < 2) return prompt;
  const lines = refs.map((b, i) => `${i + 1}. ${b.resources.find((r) => r.kind === 'image')?.caption?.title || b.name || 'Untitled image'}`);
  return `${prompt}\n\nReference images, in the order attached:\n${lines.join('\n')}`;
}

/**
 * Reads an image block's aspect ratio. Uploads (drop or paste) record none, so their block shape stands in.
 * Precondition: `block` is an image block.
 * Postcondition: returns the recorded ratio, or the ratio nearest the block's rect.
 */
function shapeOf(block: Block): AspectRatio {
  return block.aspectRatio ?? nearestRatioForSize(block.rect.w, block.rect.h, AspectRatio.options);
}

/**
 * Picks the shape of an image combined from sources when the agent gave none. The tool description asks the agent
 * to pass the ratio of the image it builds on (a room photo redecorated with other photos' ideas, GitHub #9); when it
 * does not, the first source's shape is a better guess than a square.
 * Precondition: `sourceIds` came from imageSourceIds.
 * Postcondition: returns `requested` when given; otherwise the first source's shape (see shapeOf), or `1:1` when
 * there are no sources.
 */
function combinedRatio(ctx: ToolContext, requested: AspectRatio | undefined, sourceIds: string[]): AspectRatio {
  if (requested) return requested;
  return sourceIds.length ? shapeOf(ctx.repo.getBlock(sourceIds[0])) : '1:1';
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
 * aspect ratio and its origin sources as reference images, labelled by withReferenceLabels. Try again replays the
 * same recipe (imageActions/retry).
 * Precondition: `block` exists, is `generating`, and has a prompt and an aspect ratio (startPlaceholder sets both).
 * Postcondition: on success the block holds the new image, is `ready`, a final `block` event was emitted, captioning was requested, and `{block_id, name}` is returned. On failure the block is `error`, a final `block` event was emitted and `{error}` is returned. An abort is rethrown.
 */
async function generateIntoBlock(ctx: ToolContext, block: Block): Promise<{ block_id: string; name: string } | { error: string }> {
  try {
    const refs = referenceImages(ctx, block.origin?.sourceBlockIds ?? []);
    const image = await ctx.llm.generateImage({
      model: ctx.models.image,
      prompt: withReferenceLabels(block.prompt!, refs.map((r) => r.block)),
      aspectRatio: nearestRatio(block.aspectRatio!, ctx.imageSupportedRatios),
      referenceImages: refs.map((r) => r.dataUrl),
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
 * Postcondition: see generateIntoBlock; without `ratio` the new block keeps the source's shape (see shapeOf); it sits 50 px right of the source, its origin is `action` from the source plus any extra image sources, and the source image is always sent as the first reference. Throws when the target is missing, foreign or not an image.
 */
async function editImage(
  ctx: ToolContext,
  a: { action: OriginAction; targetId: string; prompt: string; ratio?: AspectRatio; style?: string; extraSourceIds: string[] },
): Promise<{ block_id: string; name: string } | { error: string }> {
  const target = getBoardBlock(ctx, a.targetId, 'image');
  const ratio = a.ratio ?? shapeOf(target);
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
    description:
      'Generate a new image and place it on the canvas as a block. When building on one source image with ideas from others (e.g. redecorating a room photo), pass the aspect_ratio nearest that image\'s width x height so the result keeps its framing; without one, a combined image takes the shape of the first source.',
    schema: z.object({
      prompt: z.string().min(1),
      // No schema default: without one, a combined image takes its first source's shape (combinedRatio), else 1:1.
      aspect_ratio: AspectRatio.optional(),
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
     * Postcondition: see generateIntoBlock; the placeholder appears before generation starts, shaped by combinedRatio.
     */
    async run(a, ctx) {
      const sourceIds = imageSourceIds(ctx, a.source_block_ids);
      const ratio = combinedRatio(ctx, a.aspect_ratio, sourceIds);
      const base = ASPECT_SIZES[ratio];
      const prompt = a.remove_background ? `${a.prompt}. Isolated subject on a plain transparent background.` : a.prompt;
      const block = startPlaceholder(ctx, {
        name: a.name || shortName(a.prompt),
        rect: { x: a.x, y: a.y, w: a.width ?? base.w, h: a.height ?? base.h },
        prompt: composePrompt(prompt, a.style),
        aspectRatio: ratio,
        origin: originFor('reference', sourceIds),
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
