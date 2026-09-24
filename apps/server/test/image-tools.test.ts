import { describe, it, expect } from 'vitest';
import { composePrompt, imageTools } from '../src/agent/tools/image';
import type { ToolDef } from '../src/agent/skills/registry';
import { NoImageError } from '../src/llm/types';
import { PNG_BYTES, ScriptedLlm, makeCtx } from './helpers';

const tool = (name: string): ToolDef => imageTools.find((t) => t.name === name)!;

/** Adds an image block with a stored file to the ctx's board. */
function addImage(c: ReturnType<typeof makeCtx>, name = 'Source') {
  const block = c.repo.createBlock(c.board.id, { type: 'image', name, rect: { x: 100, y: 200, w: 300, h: 200 }, aspectRatio: '3:4' });
  c.repo.addResource({ blockId: block.id, kind: 'image', mimeType: 'image/png', bytes: PNG_BYTES });
  return c.repo.getBlock(block.id);
}

describe('composePrompt', () => {
  it('appends the style when given', () => {
    expect(composePrompt('a cat', undefined)).toBe('a cat');
    expect(composePrompt('a cat', 'oil paint')).toBe('a cat\n\nStyle: oil paint');
  });
});

describe('create_image_block', () => {
  it('emits a placeholder first, then the finished block, and triggers captioning', async () => {
    const c = makeCtx();
    const out = (await tool('create_image_block').run({ prompt: 'a dragon', aspect_ratio: '16:9', style: 'oil paint', x: 450, y: 0, name: 'Dragon' }, c.ctx)) as { block_id: string };
    const [first, second] = c.events;
    expect(first).toMatchObject({ type: 'block', isPlaceholder: true, block: { status: 'generating', name: 'Dragon', rect: { x: 450, y: 0, w: 640, h: 360 } } });
    expect(second).toMatchObject({ type: 'block', isPlaceholder: false, block: { id: out.block_id, status: 'ready' } });
    const block = c.repo.getBlock(out.block_id);
    expect(block.resources).toHaveLength(1);
    expect(c.imageAdded).toEqual([block.resources[0].id]);
    const call = (c.llm as ScriptedLlm).imageCalls[0];
    expect(call).toMatchObject({ model: 'test/image', aspectRatio: '16:9', prompt: 'a dragon\n\nStyle: oil paint' });
  });

  it('passes source images as data-URL references and skips foreign or text blocks', async () => {
    const c = makeCtx();
    const src = addImage(c);
    const text = c.repo.createBlock(c.board.id, { type: 'text', rect: { x: 0, y: 0, w: 10, h: 10 } });
    await tool('create_image_block').run({ prompt: 'combine', source_block_ids: [src.id, text.id] }, c.ctx);
    const refs = (c.llm as ScriptedLlm).imageCalls[0].referenceImages!;
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatch(/^data:image\/png;base64,/);
  });

  it('generates at the nearest supported ratio but keeps the requested block shape', async () => {
    const c = makeCtx({ supportedRatios: ['1:1'] });
    const out = (await tool('create_image_block').run({ prompt: 'wide', aspect_ratio: '16:9' }, c.ctx)) as { block_id: string };
    expect((c.llm as ScriptedLlm).imageCalls[0].aspectRatio).toBe('1:1');
    expect(c.repo.getBlock(out.block_id)).toMatchObject({ aspectRatio: '16:9', rect: { w: 640, h: 360 } });
  });

  it('ends in an error state when the model returns no image', async () => {
    const llm = new ScriptedLlm([], () => { throw new NoImageError('The image model returned no image.'); });
    const c = makeCtx({ llm });
    const result = (await tool('create_image_block').run({ prompt: 'x' }, c.ctx)) as { error: string };
    expect(result.error).toContain('no image');
    const last = c.events.at(-1)!;
    expect(last).toMatchObject({ type: 'block', isPlaceholder: false, block: { status: 'error' } });
    expect(c.imageAdded).toEqual([]);
    expect(c.repo.getBoard(c.board.id).blocks[0].status).toBe('error');
  });
});

describe('update_image_block', () => {
  it('creates a new block beside the original by default and references the original', async () => {
    const c = makeCtx();
    const src = addImage(c);
    const out = (await tool('update_image_block').run({ update_block_id: src.id, prompt: 'make it night' }, c.ctx)) as { block_id: string };
    const created = c.repo.getBlock(out.block_id);
    expect(created.rect).toEqual({ x: 450, y: 200, w: 300, h: 200 });
    expect(c.repo.getBlock(src.id).resources).toHaveLength(1);
    expect((c.llm as ScriptedLlm).imageCalls[0].referenceImages).toHaveLength(1);
  });
  it('replaces the image in place when asked', async () => {
    const c = makeCtx();
    const src = addImage(c);
    const oldResourceId = src.resources[0].id;
    await tool('update_image_block').run({ update_block_id: src.id, prompt: 'p', create_new_block_for_update: false }, c.ctx);
    const after = c.repo.getBlock(src.id);
    expect(after.resources).toHaveLength(1);
    expect(after.resources[0].id).not.toBe(oldResourceId);
    expect(c.repo.getBoard(c.board.id).blocks).toHaveLength(1);
  });
  it('keeps the old image and returns to ready when an in-place edit fails', async () => {
    const c = makeCtx({ llm: new ScriptedLlm([], () => { throw new Error('boom'); }) });
    const src = addImage(c);
    const result = (await tool('update_image_block').run({ update_block_id: src.id, prompt: 'p', create_new_block_for_update: false }, c.ctx)) as { error: string };
    expect(result.error).toContain('boom');
    expect(c.repo.getBlock(src.id)).toMatchObject({ status: 'ready' });
    expect(c.repo.getBlock(src.id).resources).toHaveLength(1);
  });
  it('rejects text blocks', async () => {
    const c = makeCtx();
    const t = c.repo.createBlock(c.board.id, { type: 'text', rect: { x: 0, y: 0, w: 10, h: 10 } });
    await expect(tool('update_image_block').run({ update_block_id: t.id, prompt: 'p' }, c.ctx)).rejects.toThrow(/image block/);
  });
});

describe('remove_background', () => {
  it('creates a new block from the source with a background-removal prompt', async () => {
    const c = makeCtx();
    const src = addImage(c);
    await tool('remove_background').run({ source_block_id: src.id }, c.ctx);
    expect((c.llm as ScriptedLlm).imageCalls[0].prompt).toMatch(/Remove the background/);
    expect(c.repo.getBoard(c.board.id).blocks).toHaveLength(2);
  });
});

describe('abort during generation', () => {
  it('does not leave the block generating forever', async () => {
    const ac = new AbortController();
    const llm = new ScriptedLlm([], async () => { ac.abort(); throw new Error('aborted'); });
    const c = makeCtx({ llm });
    c.ctx.signal = ac.signal;
    await expect(tool('create_image_block').run({ prompt: 'x' }, c.ctx)).rejects.toThrow();
    const blocks = c.repo.getBoard(c.board.id).blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0].status).toBe('error');
  });
});
