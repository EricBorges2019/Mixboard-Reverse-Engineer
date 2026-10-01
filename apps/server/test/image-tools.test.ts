import { describe, it, expect } from 'vitest';
import { composePrompt, imageTools, withReferenceLabels } from '../src/agent/tools/image';
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

describe('withReferenceLabels', () => {
  it('leaves a prompt with fewer than two references alone, and numbers several by caption title or name', () => {
    const c = makeCtx();
    const room = addImage(c, 'IMG_2231.jpg');
    c.repo.setCaption(room.resources[0].id, { title: 'Bright open-plan living room', description: 'd' });
    const leaves = addImage(c, 'Maple garland');
    expect(withReferenceLabels('p', [room])).toBe('p');
    expect(withReferenceLabels('p', [c.repo.getBlock(room.id), leaves])).toBe(
      'p\n\nReference images, in the order attached:\n1. Bright open-plan living room\n2. Maple garland',
    );
  });
});

describe('create_image_block', () => {
  // GitHub #9, from Mixboard's sample board: three fall decor photos plus a living-room photo, "Decorate my living
  // room using these ideas". The result should keep the room's wide shape and say which attached image is which.
  it('redecorates a room photo from decor photos: first source shape, labelled references in order', async () => {
    const c = makeCtx();
    const room = c.repo.createBlock(c.board.id, { type: 'image', name: 'living-room.jpg', rect: { x: 0, y: 0, w: 1280, h: 700 } });
    c.repo.addResource({ blockId: room.id, kind: 'image', mimeType: 'image/png', bytes: PNG_BYTES });
    const decor = ['Window garland', 'Pumpkin runner', 'Cider jar'].map((n) => addImage(c, n));
    const ids = [room.id, ...decor.map((d) => d.id)];
    const out = (await tool('create_image_block').run({ prompt: 'Decorate the living room with these fall ideas', source_block_ids: ids }, c.ctx)) as { block_id: string };

    const call = (c.llm as ScriptedLlm).imageCalls[0];
    expect(call.aspectRatio).toBe('16:9'); // an upload records no ratio: 1280x700 is nearest 16:9
    expect(call.referenceImages).toHaveLength(4);
    expect(call.prompt).toBe(
      'Decorate the living room with these fall ideas\n\nReference images, in the order attached:\n1. living-room.jpg\n2. Window garland\n3. Pumpkin runner\n4. Cider jar',
    );
    // The stored prompt stays clean: labels are rebuilt from whichever sources still exist at generation time.
    expect(c.repo.getBlock(out.block_id)).toMatchObject({ aspectRatio: '16:9', prompt: 'Decorate the living room with these fall ideas', origin: { action: 'reference', sourceBlockIds: ids } });
  });

  it('falls back to the first source shape, so a room selected last needs an explicit ratio', async () => {
    const c = makeCtx();
    const decor = addImage(c, 'Window garland'); // recorded 3:4
    const room = c.repo.createBlock(c.board.id, { type: 'image', name: 'living-room.jpg', rect: { x: 0, y: 0, w: 1280, h: 700 } });
    c.repo.addResource({ blockId: room.id, kind: 'image', mimeType: 'image/png', bytes: PNG_BYTES });
    await tool('create_image_block').run({ prompt: 'Decorate the room', source_block_ids: [decor.id, room.id] }, c.ctx);
    await tool('create_image_block').run({ prompt: 'Decorate the room', source_block_ids: [decor.id, room.id], aspect_ratio: '16:9' }, c.ctx);
    expect((c.llm as ScriptedLlm).imageCalls.map((x) => x.aspectRatio)).toEqual(['3:4', '16:9']);
  });

  it('uses a recorded source ratio, lets an explicit ratio win, and stays square without sources', async () => {
    const c = makeCtx();
    const src = addImage(c); // recorded 3:4
    await tool('create_image_block').run({ prompt: 'a', source_block_ids: [src.id] }, c.ctx);
    await tool('create_image_block').run({ prompt: 'b', source_block_ids: [src.id], aspect_ratio: '9:16' }, c.ctx);
    await tool('create_image_block').run({ prompt: 'c' }, c.ctx);
    expect((c.llm as ScriptedLlm).imageCalls.map((x) => x.aspectRatio)).toEqual(['3:4', '9:16', '1:1']);
  });

  it('emits a placeholder first, then the finished block, and triggers captioning', async () => {
    const c = makeCtx();
    const out = (await tool('create_image_block').run({ prompt: 'a dragon', aspect_ratio: '16:9', style: 'oil paint', x: 450, y: 0, name: 'Dragon' }, c.ctx)) as { block_id: string };
    const [first, second] = c.events;
    expect(first).toMatchObject({ type: 'block', isPlaceholder: true, block: { status: 'generating', name: 'Dragon', rect: { x: 450, y: 0, w: 640, h: 360 } } });
    // The stored prompt includes the style, so Try again can replay the exact request.
    expect(first).toMatchObject({ block: { prompt: 'a dragon\n\nStyle: oil paint' } });
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

  it('records image references as the origin, and no origin for a text-only prompt', async () => {
    const c = makeCtx();
    const a = addImage(c, 'A');
    const b = addImage(c, 'B');
    const text = c.repo.createBlock(c.board.id, { type: 'text', rect: { x: 0, y: 0, w: 10, h: 10 } });
    const combined = (await tool('create_image_block').run({ prompt: 'combine', source_block_ids: [a.id, text.id, b.id] }, c.ctx)) as { block_id: string };
    const plain = (await tool('create_image_block').run({ prompt: 'a cat' }, c.ctx)) as { block_id: string };
    expect(c.repo.getBlock(combined.block_id).origin).toEqual({ action: 'reference', sourceBlockIds: [a.id, b.id] });
    expect(c.repo.getBlock(plain.block_id).origin).toBeNull();
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
  it('keeps an uploaded room photo wide when editing it with decor photos as extra references (GitHub #9)', async () => {
    const c = makeCtx();
    const room = c.repo.createBlock(c.board.id, { type: 'image', name: 'living-room.jpg', rect: { x: 0, y: 0, w: 1280, h: 700 } });
    c.repo.addResource({ blockId: room.id, kind: 'image', mimeType: 'image/png', bytes: PNG_BYTES });
    const decor = addImage(c, 'Pumpkin runner');
    const out = (await tool('update_image_block').run({ update_block_id: room.id, prompt: 'Decorate with these fall ideas', source_block_ids: [decor.id] }, c.ctx)) as { block_id: string };
    const call = (c.llm as ScriptedLlm).imageCalls[0];
    expect(call.aspectRatio).toBe('16:9');
    expect(call.prompt).toBe('Decorate with these fall ideas\n\nReference images, in the order attached:\n1. living-room.jpg\n2. Pumpkin runner');
    expect(c.repo.getBlock(out.block_id)).toMatchObject({ aspectRatio: '16:9', rect: { w: 1280, h: 700 } });
  });
  it('never replaces the original, even when create_new_block_for_update is false', async () => {
    const c = makeCtx();
    const src = addImage(c);
    const oldResourceId = src.resources[0].id;
    const out = (await tool('update_image_block').run({ update_block_id: src.id, prompt: 'p', intent: 'regenerate', create_new_block_for_update: false }, c.ctx)) as { block_id: string };
    expect(out.block_id).not.toBe(src.id);
    expect(c.repo.getBlock(src.id)).toMatchObject({ status: 'ready', resources: [{ id: oldResourceId }] });
    expect(c.repo.getBoard(c.board.id).blocks).toHaveLength(2);
    expect(c.events.every((e) => e.type !== 'block' || e.block.id !== src.id)).toBe(true);
  });
  it('leaves the original untouched and marks only the new block as failed when generation fails', async () => {
    const c = makeCtx({ llm: new ScriptedLlm([], () => { throw new Error('boom'); }) });
    const src = addImage(c);
    const result = (await tool('update_image_block').run({ update_block_id: src.id, prompt: 'p' }, c.ctx)) as { error: string };
    expect(result.error).toContain('boom');
    expect(c.repo.getBlock(src.id)).toMatchObject({ status: 'ready', resources: [{ id: src.resources[0].id }] });
    expect(c.repo.getBoard(c.board.id).blocks.find((b) => b.id !== src.id)).toMatchObject({ status: 'error' });
  });
  it('records the edited image and extra references as the origin', async () => {
    const c = makeCtx();
    const src = addImage(c, 'Source');
    const extra = addImage(c, 'Extra');
    const out = (await tool('update_image_block').run({ update_block_id: src.id, prompt: 'p', source_block_ids: [extra.id, src.id] }, c.ctx)) as { block_id: string };
    expect(c.repo.getBlock(out.block_id).origin).toEqual({ action: 'edit', sourceBlockIds: [src.id, extra.id] });
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
  it('records the source as the origin', async () => {
    const c = makeCtx();
    const src = addImage(c);
    const out = (await tool('remove_background').run({ source_block_id: src.id }, c.ctx)) as { block_id: string };
    expect(c.repo.getBlock(out.block_id).origin).toEqual({ action: 'remove-background', sourceBlockIds: [src.id] });
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
