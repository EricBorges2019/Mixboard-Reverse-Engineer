import { describe, it, expect } from 'vitest';
import { SkillRegistry } from '../src/agent/skills/registry';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { PNG_BYTES, ScriptedLlm, makeRepo, textReply } from './helpers';

/** An app over a board with one text block and one uploaded image block. */
function setup(llm: ScriptedLlm) {
  const { repo } = makeRepo();
  const board = repo.createBoard(repo.createProject().id);
  const image = repo.createBlock(board.id, { type: 'image', name: 'Mandrill', rect: { x: 0, y: 0, w: 300, h: 400 } });
  repo.addResource({ blockId: image.id, kind: 'image', mimeType: 'image/png', bytes: PNG_BYTES });
  const text = repo.createBlock(board.id, { type: 'text', rect: { x: 0, y: 0, w: 10, h: 10 } });
  const failed = repo.createBlock(board.id, { type: 'image', status: 'error', prompt: 'a mandrill', aspectRatio: '1:1', rect: { x: 0, y: 0, w: 300, h: 300 } });
  const config = loadConfig({});
  const app = createApp({ repo, config, onImageAdded: () => {}, agent: { repo, llm, registry: new SkillRegistry([]), config, onImageAdded: () => {} } });
  const post = (path: string) => app.request(path, { method: 'POST' });
  return { image, text, failed, post, llm };
}

/** Event types in an SSE body, in order. */
const eventTypes = (body: string) => [...body.matchAll(/^event: (\w+)$/gm)].map((m) => m[1]);

describe('POST /api/blocks/:id/regenerate', () => {
  it('streams the placeholder, the finished block, then done', async () => {
    const s = setup(new ScriptedLlm([textReply('A new take.')]));
    const res = await s.post(`/api/blocks/${s.image.id}/regenerate`);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(eventTypes(await res.text())).toEqual(['block', 'block', 'done']);
  });
  it('streams an error event before done when generation fails', async () => {
    const s = setup(new ScriptedLlm([]));
    const body = await (await s.post(`/api/blocks/${s.image.id}/regenerate`)).text();
    expect(eventTypes(body)).toEqual(['block', 'block', 'error', 'done']);
  });
  it('answers 400 for a text block and 404 for an unknown block, without calling a model', async () => {
    const s = setup(new ScriptedLlm([]));
    expect((await s.post(`/api/blocks/${s.text.id}/regenerate`)).status).toBe(400);
    expect((await s.post('/api/blocks/nope/regenerate')).status).toBe(404);
    expect(s.llm.chatCalls).toEqual([]);
  });
});

describe('POST /api/blocks/:id/more-like-this', () => {
  it('streams three placeholders and three finished blocks, then done', async () => {
    const reply = 'SHORT_LABEL\nMandrill\nVARIANT_1\na\nVARIANT_2\nb\nVARIANT_3\nc\nEND_VARIANTS';
    const s = setup(new ScriptedLlm([textReply(reply)]));
    const body = await (await s.post(`/api/blocks/${s.image.id}/more-like-this`)).text();
    expect(eventTypes(body)).toEqual([...Array(6).fill('block'), 'done']);
  });
  it('answers 400 for a text block', async () => {
    const s = setup(new ScriptedLlm([]));
    expect((await s.post(`/api/blocks/${s.text.id}/more-like-this`)).status).toBe(400);
  });
});

describe('POST /api/blocks/:id/retry', () => {
  it('streams the failed block going back to generating, then ready, then done', async () => {
    const s = setup(new ScriptedLlm());
    const body = await (await s.post(`/api/blocks/${s.failed.id}/retry`)).text();
    expect(eventTypes(body)).toEqual(['block', 'block', 'done']);
    expect(body).toContain(`"id":"${s.failed.id}"`);
  });
  it('answers 400 for an image that did not fail', async () => {
    const s = setup(new ScriptedLlm());
    expect((await s.post(`/api/blocks/${s.image.id}/retry`)).status).toBe(400);
  });
});
