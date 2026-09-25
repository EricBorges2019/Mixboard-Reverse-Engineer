import { describe, it, expect, vi } from 'vitest';
import { createCaptionJob, parseCaption } from '../src/jobs/caption';
import { generateTagline } from '../src/jobs/tagline';
import { LlmError } from '../src/llm/types';
import { PNG_BYTES, ScriptedLlm, makeRepo, textReply } from './helpers';

const valid = 'LONG_DESCRIPTION\nA dragon reads.\n\nCandles glow.\nSHORT_LABEL\nDragon Scholar\nEND_LABELS';

/** Repo with one image resource. */
function withImage() {
  const { repo } = makeRepo();
  const board = repo.createBoard(repo.createProject().id);
  const block = repo.createBlock(board.id, { type: 'image', rect: { x: 0, y: 0, w: 10, h: 10 } });
  const resource = repo.addResource({ blockId: block.id, kind: 'image', mimeType: 'image/png', bytes: PNG_BYTES });
  return { repo, resource };
}

describe('parseCaption', () => {
  it('parses the recovered LONG_DESCRIPTION / SHORT_LABEL format', () => {
    expect(parseCaption(valid)).toEqual({ title: 'Dragon Scholar', description: 'A dragon reads.\n\nCandles glow.' });
  });
  it('tolerates code fences, CRLF and a missing END_LABELS', () => {
    expect(parseCaption('```\r\nLONG_DESCRIPTION\r\nA cat.\r\nSHORT_LABEL\r\nSleeping Cat\r\n```')).toEqual({ title: 'Sleeping Cat', description: 'A cat.' });
  });
  it('rejects malformed or empty output', () => {
    expect(() => parseCaption('not a caption')).toThrow();
    expect(() => parseCaption('LONG_DESCRIPTION\n\nSHORT_LABEL\nT\nEND_LABELS')).toThrow();
    expect(() => parseCaption('LONG_DESCRIPTION\nA cat.\nSHORT_LABEL\n\nEND_LABELS')).toThrow();
  });
});

describe('caption job', () => {
  it('captions an image using the caption model and the image as a data URL', async () => {
    const { repo, resource } = withImage();
    const llm = new ScriptedLlm([textReply(valid)]);
    await createCaptionJob({ repo, llm, getModel: () => 'test/caption' }).enqueue(resource.id);
    expect(repo.getResource(resource.id).caption).toEqual({ title: 'Dragon Scholar', description: 'A dragon reads.\n\nCandles glow.', userEdited: false });
    expect(llm.chatCalls[0].model).toBe('test/caption');
    expect(JSON.stringify(llm.chatCalls[0].messages)).toContain('data:image/png;base64,');
    expect(JSON.stringify(llm.chatCalls[0].messages)).toContain('Describe this image in enough detail');
  });
  it('retries after a bad reply with backoff', async () => {
    const { repo, resource } = withImage();
    const llm = new ScriptedLlm([textReply('nope'), textReply(valid)]);
    const sleep = vi.fn(async () => {});
    await createCaptionJob({ repo, llm, getModel: () => 'm', sleep }).enqueue(resource.id);
    expect(llm.chatCalls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(repo.getResource(resource.id).caption?.title).toBe('Dragon Scholar');
  });
  it('gives up quietly after the attempt limit, leaving the caption empty', async () => {
    const { repo, resource } = withImage();
    const llm = new ScriptedLlm([textReply('x'), textReply('y'), textReply('z')]);
    await expect(createCaptionJob({ repo, llm, getModel: () => 'm', sleep: async () => {} }).enqueue(resource.id)).resolves.toBeUndefined();
    expect(llm.chatCalls).toHaveLength(3);
    expect(repo.getResource(resource.id).caption).toBeNull();
  });
  it('never overwrites a user-edited caption', async () => {
    const { repo, resource } = withImage();
    repo.setCaption(resource.id, { title: 'Mine', description: 'Mine' }, true);
    await createCaptionJob({ repo, llm: new ScriptedLlm([textReply(valid)]), getModel: () => 'm' }).enqueue(resource.id);
    expect(repo.getResource(resource.id).caption?.title).toBe('Mine');
  });
  it('does nothing for a resource without a file', async () => {
    const { repo } = makeRepo();
    const board = repo.createBoard(repo.createProject().id);
    const block = repo.createBlock(board.id, { type: 'text', rect: { x: 0, y: 0, w: 10, h: 10 } });
    const r = repo.addResource({ blockId: block.id, kind: 'text', mimeType: 'text/plain', content: {} });
    const llm = new ScriptedLlm([]);
    await createCaptionJob({ repo, llm, getModel: () => 'm' }).enqueue(r.id);
    expect(llm.chatCalls).toHaveLength(0);
  });
});

describe('generateTagline', () => {
  it('returns the first line, unquoted and capped', async () => {
    const llm = new ScriptedLlm([textReply('"Paws-ing to fetch your pets!"\nextra')]);
    expect(await generateTagline({ llm, model: 'test/tagline', message: 'dog pics' })).toBe('Paws-ing to fetch your pets!');
    expect(llm.chatCalls[0].model).toBe('test/tagline');
  });
  it('returns null for empty replies and for model failures', async () => {
    expect(await generateTagline({ llm: new ScriptedLlm([textReply('  ')]), model: 'm', message: 'x' })).toBeNull();
    const failing = new ScriptedLlm();
    failing.chat = async () => { throw new LlmError('down'); };
    expect(await generateTagline({ llm: failing, model: 'm', message: 'x' })).toBeNull();
  });
});
