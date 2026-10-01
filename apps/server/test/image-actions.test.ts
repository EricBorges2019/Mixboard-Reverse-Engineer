import { describe, it, expect } from 'vitest';
import type { AgentEvent, Block } from '@mixboard/shared';
import { moreLikeThis, parseVariants } from '../src/imageActions/moreLikeThis';
import { regenerate } from '../src/imageActions/regenerate';
import type { ImageActionRun } from '../src/imageActions/source';
import { loadConfig } from '../src/config';
import { PNG_BYTES, ScriptedLlm, makeRepo, textReply } from './helpers';

/** A buffer whose PNG header reports `w`x`h`, enough for readPngSize. */
function pngOfSize(w: number, h: number): Buffer {
  const b = Buffer.alloc(24);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

/** A board holding one uploaded portrait (the source rect from the SPEC §4.6 capture), plus a run context over it. */
function setup(opts: { llm?: ScriptedLlm; crop?: boolean } = {}) {
  const { repo } = makeRepo();
  if (opts.crop === false) repo.updateSettings({ cropRegenerated: false });
  const board = repo.createBoard(repo.createProject().id);
  const created = repo.createBlock(board.id, { type: 'image', name: 'Mandrill', rect: { x: 55, y: 508, w: 367, h: 500 } });
  repo.addResource({ blockId: created.id, kind: 'image', mimeType: 'image/png', bytes: PNG_BYTES });
  const source = repo.getBlock(created.id);
  const events: AgentEvent[] = [];
  const imageAdded: string[] = [];
  const llm = opts.llm ?? new ScriptedLlm();
  const run: ImageActionRun = {
    deps: { repo, llm, config: loadConfig({}), onImageAdded: (id) => imageAdded.push(id) },
    emit: (e) => events.push(e),
    signal: new AbortController().signal,
  };
  const blocks = (e: AgentEvent[]) => e.filter((x): x is Extract<AgentEvent, { type: 'block' }> => x.type === 'block');
  const others = () => repo.getBoard(board.id).blocks.filter((b) => b.id !== source.id);
  return { repo, board, source, run, events, blocks, imageAdded, llm, others };
}

const REGEN_PROMPT = 'A golden snub-nosed monkey on a snowy branch at dawn, painted in soft gouache.';
const VARIANTS_REPLY = [
  'SHORT_LABEL', 'Mandrill Portrait',
  'VARIANT_1', 'A mandrill face in close-up against green foliage.',
  'VARIANT_2', 'A mandrill face in close-up in warm studio light.',
  'VARIANT_3', 'A mandrill face in close-up, slightly turned to the viewer\'s left.',
  'END_VARIANTS',
].join('\n');

describe('regenerate', () => {
  it('writes a new prompt from the source, then generates a square image with no reference into a new block', async () => {
    const t = setup({ llm: new ScriptedLlm([textReply(REGEN_PROMPT)]) });
    await regenerate(t.run, t.source.id);

    const [placeholder, done] = t.blocks(t.events);
    expect(placeholder).toMatchObject({ isPlaceholder: true, block: { name: '', status: 'generating', rect: { x: 95, y: 548, w: 367, h: 500 } } });
    expect(done).toMatchObject({ isPlaceholder: false, block: { id: placeholder.block.id, status: 'ready', prompt: REGEN_PROMPT, rect: { w: 367, h: 500 } } });

    const vision = JSON.stringify(t.llm.chatCalls[0]);
    expect(t.llm.chatCalls[0].model).toBe('test/caption');
    expect(vision).toContain('write a prompt for a new, different image');
    expect(vision).toContain('data:image/png;base64,');
    expect(t.llm.imageCalls).toEqual([expect.objectContaining({ prompt: REGEN_PROMPT, aspectRatio: '1:1', referenceImages: [] })]);
    expect(t.imageAdded).toEqual([done.block.resources[0].id]);
  });

  it('records the source as the new block\'s origin', async () => {
    const t = setup({ llm: new ScriptedLlm([textReply(REGEN_PROMPT)]) });
    await regenerate(t.run, t.source.id);
    expect(t.others()[0].origin).toEqual({ action: 'regenerate', sourceBlockIds: [t.source.id] });
  });

  it('never touches the source block', async () => {
    const t = setup({ llm: new ScriptedLlm([textReply(REGEN_PROMPT)]) });
    await regenerate(t.run, t.source.id);
    expect(t.repo.getBlock(t.source.id)).toEqual(t.source);
    expect(t.blocks(t.events).every((e) => e.block.id !== t.source.id)).toBe(true);
  });

  it('with cropping off, starts landscape and then takes the image shape, long side matching the source', async () => {
    const t = setup({ crop: false, llm: new ScriptedLlm([textReply(REGEN_PROMPT)], () => ({ bytes: pngOfSize(1024, 1024), mimeType: 'image/png' })) });
    await regenerate(t.run, t.source.id);
    const [placeholder, done] = t.blocks(t.events);
    expect(placeholder.block.rect).toEqual({ x: 95, y: 548, w: 500, h: 375 });
    expect(done.block.rect).toEqual({ x: 95, y: 548, w: 500, h: 500 });
  });

  it('with cropping off, sizes a wide image by its width', async () => {
    const t = setup({ crop: false, llm: new ScriptedLlm([textReply(REGEN_PROMPT)], () => ({ bytes: pngOfSize(1920, 1080), mimeType: 'image/png' })) });
    await regenerate(t.run, t.source.id);
    expect(t.blocks(t.events).at(-1)!.block.rect).toEqual({ x: 95, y: 548, w: 500, h: 281 });
  });

  it('marks the new block failed and rethrows when the prompt cannot be written', async () => {
    const t = setup({ llm: new ScriptedLlm([]) });
    await expect(regenerate(t.run, t.source.id)).rejects.toThrow();
    expect(t.others()).toEqual([expect.objectContaining({ status: 'error' })]);
    expect(t.blocks(t.events).at(-1)!.block.status).toBe('error');
    expect(t.llm.imageCalls).toEqual([]);
  });

  it('rejects a text block and an image without a stored file', async () => {
    const t = setup();
    const text = t.repo.createBlock(t.board.id, { type: 'text', rect: { x: 0, y: 0, w: 10, h: 10 } });
    const empty = t.repo.createBlock(t.board.id, { type: 'image', rect: { x: 0, y: 0, w: 10, h: 10 } });
    await expect(regenerate(t.run, text.id)).rejects.toThrow(/image/);
    await expect(regenerate(t.run, empty.id)).rejects.toThrow(/image/);
  });
});

describe('moreLikeThis', () => {
  it('creates three named variants in a row below the source, each from its own description at the source ratio', async () => {
    const t = setup({ llm: new ScriptedLlm([textReply(VARIANTS_REPLY)]) });
    await moreLikeThis(t.run, t.source.id);

    const placeholders = t.blocks(t.events).filter((e) => e.isPlaceholder).map((e) => e.block);
    expect(placeholders.map((b: Block) => [b.name, b.rect])).toEqual([
      ['Mandrill Portrait Variant 1', { x: 55, y: 1048, w: 367, h: 500 }],
      ['Mandrill Portrait Variant 2', { x: 442, y: 1048, w: 367, h: 500 }],
      ['Mandrill Portrait Variant 3', { x: 829, y: 1048, w: 367, h: 500 }],
    ]);
    expect(t.llm.chatCalls[0].model).toBe('test/caption');
    expect(JSON.stringify(t.llm.chatCalls[0])).toContain('Write three descriptions of this image');
    expect(t.llm.imageCalls.map((c) => [c.prompt, c.aspectRatio, c.referenceImages])).toEqual([
      ['A mandrill face in close-up against green foliage.', '3:4', []],
      ['A mandrill face in close-up in warm studio light.', '3:4', []],
      ['A mandrill face in close-up, slightly turned to the viewer\'s left.', '3:4', []],
    ]);
  });

  it('stores each description as the prompt and the caption, and skips the caption job', async () => {
    const t = setup({ llm: new ScriptedLlm([textReply(VARIANTS_REPLY)]) });
    await moreLikeThis(t.run, t.source.id);
    const variant = t.others().find((b) => b.name === 'Mandrill Portrait Variant 2')!;
    expect(variant).toMatchObject({ status: 'ready', prompt: 'A mandrill face in close-up in warm studio light.' });
    expect(variant.resources[0].caption).toEqual({ title: '', description: 'A mandrill face in close-up in warm studio light.', userEdited: false });
    expect(t.imageAdded).toEqual([]);
    expect(t.repo.getBlock(t.source.id)).toEqual(t.source);
  });

  it('records the source as each variant\'s origin', async () => {
    const t = setup({ llm: new ScriptedLlm([textReply(VARIANTS_REPLY)]) });
    await moreLikeThis(t.run, t.source.id);
    expect(t.others().map((b) => b.origin)).toEqual(Array(3).fill({ action: 'more-like-this', sourceBlockIds: [t.source.id] }));
  });

  it('finishes the other variants when one image fails, then reports the failure', async () => {
    let n = 0;
    const llm = new ScriptedLlm([textReply(VARIANTS_REPLY)], () => {
      if (++n === 2) throw new Error('boom');
      return { bytes: PNG_BYTES, mimeType: 'image/png' };
    });
    const t = setup({ llm });
    await expect(moreLikeThis(t.run, t.source.id)).rejects.toThrow(/1 of 3 variations failed.*boom/);
    expect(t.others().map((b) => b.status).sort()).toEqual(['error', 'ready', 'ready']);
  });

  it('creates no blocks when the descriptions cannot be parsed', async () => {
    const t = setup({ llm: new ScriptedLlm([textReply('Sorry, I cannot help with that.')]) });
    await expect(moreLikeThis(t.run, t.source.id)).rejects.toThrow(/VARIANT/);
    expect(t.others()).toEqual([]);
  });
});

describe('parseVariants', () => {
  it('tolerates code fences, CRLF and a missing END_VARIANTS', () => {
    const reply = '```\r\n' + VARIANTS_REPLY.replace('\nEND_VARIANTS', '').replace(/\n/g, '\r\n') + '\r\n```';
    expect(parseVariants(reply)).toEqual({
      title: 'Mandrill Portrait',
      descriptions: ['A mandrill face in close-up against green foliage.', 'A mandrill face in close-up in warm studio light.', 'A mandrill face in close-up, slightly turned to the viewer\'s left.'],
    });
  });
  it('keeps multi-paragraph descriptions whole', () => {
    const reply = VARIANTS_REPLY.replace('A mandrill face in close-up against green foliage.', 'Line one.\n\nLine two.');
    expect(parseVariants(reply).descriptions[0]).toBe('Line one.\n\nLine two.');
  });
});
