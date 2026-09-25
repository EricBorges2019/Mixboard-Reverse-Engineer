import { describe, it, expect } from 'vitest';
import type { AgentEvent, Block, NewBlockInput } from '@mixboard/shared';
import { retry } from '../src/imageActions/retry';
import type { ImageActionRun } from '../src/imageActions/source';
import { loadConfig } from '../src/config';
import { PNG_BYTES, ScriptedLlm, makeRepo, textReply } from './helpers';

/** A board with one uploaded source image, plus a helper to add a failed block and a run context. */
function setup(llm = new ScriptedLlm()) {
  const { repo } = makeRepo();
  const board = repo.createBoard(repo.createProject().id);
  const created = repo.createBlock(board.id, { type: 'image', name: 'Mandrill', rect: { x: 0, y: 0, w: 300, h: 400 } });
  repo.addResource({ blockId: created.id, kind: 'image', mimeType: 'image/png', bytes: PNG_BYTES });
  const source = repo.getBlock(created.id);
  const events: AgentEvent[] = [];
  const imageAdded: string[] = [];
  const run: ImageActionRun = {
    deps: { repo, llm, config: loadConfig({}), onImageAdded: (id) => imageAdded.push(id) },
    emit: (e) => events.push(e),
    signal: new AbortController().signal,
  };
  /** Adds a failed image block at (500, 0), 300x400 unless the input says otherwise. */
  const failed = (input: Partial<NewBlockInput>): Block => repo.createBlock(board.id, { type: 'image', status: 'error', rect: { x: 500, y: 0, w: 300, h: 400 }, ...input });
  const blockEvents = () => events.filter((e): e is Extract<AgentEvent, { type: 'block' }> => e.type === 'block');
  return { repo, board, source, run, events, blockEvents, imageAdded, llm, failed };
}

describe('retry', () => {
  it('regenerates an agent-made image into the same block from its stored prompt, with its sources as references', async () => {
    const t = setup();
    const block = t.failed({ name: 'Oil Mandrill', prompt: 'a mandrill\n\nStyle: oil paint', aspectRatio: '3:4', origin: { action: 'edit', sourceBlockIds: [t.source.id] } });
    await retry(t.run, block.id);

    expect(t.blockEvents().map((e) => [e.block.id, e.block.status, e.isPlaceholder])).toEqual([[block.id, 'generating', true], [block.id, 'ready', false]]);
    expect(t.llm.imageCalls).toEqual([expect.objectContaining({ prompt: 'a mandrill\n\nStyle: oil paint', aspectRatio: '3:4' })]);
    expect(t.llm.imageCalls[0].referenceImages).toHaveLength(1);
    expect(t.repo.getBlock(block.id)).toMatchObject({ status: 'ready', rect: { x: 500, y: 0, w: 300, h: 400 }, resources: [{ kind: 'image' }] });
    expect(t.imageAdded).toHaveLength(1);
    expect(t.repo.getBoard(t.board.id).blocks).toHaveLength(2);
  });

  it('skips sources that were deleted since', async () => {
    const t = setup();
    const block = t.failed({ prompt: 'a mandrill', origin: { action: 'reference', sourceBlockIds: [t.source.id] } });
    t.repo.deleteBlock(t.source.id);
    await retry(t.run, block.id);
    expect(t.llm.imageCalls[0].referenceImages).toEqual([]);
  });

  it('regenerates a More like this variant from its description, and stores the description as its caption again', async () => {
    const t = setup();
    const block = t.failed({ name: 'Mandrill Variant 2', prompt: 'A mandrill in warm light.', aspectRatio: '3:4', origin: { action: 'more-like-this', sourceBlockIds: [t.source.id] } });
    await retry(t.run, block.id);
    expect(t.llm.imageCalls).toEqual([expect.objectContaining({ prompt: 'A mandrill in warm light.', aspectRatio: '3:4', referenceImages: [] })]);
    expect(t.repo.getBlock(block.id).resources[0].caption).toMatchObject({ title: '', description: 'A mandrill in warm light.' });
    expect(t.imageAdded).toEqual([]);
  });

  it('regenerates a Regenerate block from its prompt as a square with no reference', async () => {
    const t = setup();
    const block = t.failed({ prompt: 'A new take.', aspectRatio: '1:1', origin: { action: 'regenerate', sourceBlockIds: [t.source.id] } });
    await retry(t.run, block.id);
    expect(t.llm.chatCalls).toEqual([]);
    expect(t.llm.imageCalls).toEqual([expect.objectContaining({ prompt: 'A new take.', aspectRatio: '1:1', referenceImages: [] })]);
  });

  it('writes the prompt first for a Regenerate block whose prompt step failed', async () => {
    const t = setup(new ScriptedLlm([textReply('A fresh take.')]));
    const block = t.failed({ aspectRatio: '1:1', origin: { action: 'regenerate', sourceBlockIds: [t.source.id] } });
    await retry(t.run, block.id);
    expect(JSON.stringify(t.llm.chatCalls[0])).toContain('write a prompt for a new, different image');
    expect(t.repo.getBlock(block.id)).toMatchObject({ status: 'ready', prompt: 'A fresh take.' });
  });

  it('fails clearly when a Regenerate block without a prompt has lost its source', async () => {
    const t = setup();
    const block = t.failed({ aspectRatio: '1:1', origin: { action: 'regenerate', sourceBlockIds: [t.source.id] } });
    t.repo.deleteBlock(t.source.id);
    await expect(retry(t.run, block.id)).rejects.toThrow(/source image was deleted/);
    expect(t.repo.getBlock(block.id).status).toBe('error');
  });

  it('marks the block failed again when generation fails', async () => {
    const t = setup(new ScriptedLlm([], () => { throw new Error('boom'); }));
    const block = t.failed({ prompt: 'a mandrill' });
    await expect(retry(t.run, block.id)).rejects.toThrow('boom');
    expect(t.repo.getBlock(block.id).status).toBe('error');
    expect(t.blockEvents().at(-1)!.block.status).toBe('error');
  });

  it('refuses blocks that are not failed images, or that have nothing to replay', async () => {
    const t = setup();
    const noPrompt = t.failed({});
    const text = t.repo.createBlock(t.board.id, { type: 'text', rect: { x: 0, y: 0, w: 10, h: 10 } });
    await expect(retry(t.run, t.source.id)).rejects.toThrow(/failed image/);
    await expect(retry(t.run, text.id)).rejects.toThrow(/failed image/);
    await expect(retry(t.run, noPrompt.id)).rejects.toThrow(/nothing to try again/i);
    expect(t.llm.imageCalls).toEqual([]);
  });
});
