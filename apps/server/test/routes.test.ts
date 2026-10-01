import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { makeRepo } from './helpers';

/** Builds an app over a temp repo and records onImageAdded calls. */
function setup() {
  const { repo } = makeRepo();
  const added: string[] = [];
  const app = createApp({ repo, config: loadConfig({}), onImageAdded: (id) => added.push(id) });
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const init: RequestInit = { method, headers: { ...headers } };
    if (body instanceof Uint8Array) init.body = body as unknown as BodyInit;
    else if (body !== undefined) { init.body = JSON.stringify(body); (init.headers as any)['content-type'] = 'application/json'; }
    return app.request(path, init);
  };
  return { call, added, repo };
}

describe('routes', () => {
  it('creates a project with a first board, then blocks, patches and deletes', async () => {
    const { call } = setup();
    const created = await (await call('POST', '/api/projects', { title: 'T' })).json();
    const boardId = created.board.id;
    const blockRes = await call('POST', `/api/boards/${boardId}/blocks`, { type: 'text', rect: { x: 0, y: 0, w: 10, h: 10 } });
    expect(blockRes.status).toBe(201);
    const block = await blockRes.json();
    const patched = await (await call('PATCH', `/api/blocks/${block.id}`, { name: 'n' })).json();
    expect(patched.name).toBe('n');
    expect((await call('DELETE', `/api/blocks/${block.id}`)).status).toBe(204);
    expect((await call('GET', `/api/boards/${boardId}`).then((r) => r.json())).blocks).toEqual([]);
  });

  it('returns 404 for unknown ids and 400 for invalid bodies', async () => {
    const { call } = setup();
    expect((await call('PATCH', '/api/blocks/nope', { name: 'x' })).status).toBe(404);
    expect((await call('GET', '/api/boards/nope')).status).toBe(404);
    const { board } = await (await call('POST', '/api/projects')).json();
    expect((await call('POST', `/api/boards/${board.id}/blocks`, { type: 'bogus' })).status).toBe(400);
  });

  it('rejects non-image and oversized uploads without touching the block', async () => {
    const { call, added } = setup();
    const { board } = await (await call('POST', '/api/projects')).json();
    const block = await (await call('POST', `/api/boards/${board.id}/blocks`, { type: 'image', rect: { x: 0, y: 0, w: 10, h: 10 } })).json();
    const bad = await call('PUT', `/api/blocks/${block.id}/image`, new Uint8Array([1, 2]), { 'content-type': 'text/plain' });
    expect(bad.status).toBe(415);
    const big = await call('PUT', `/api/blocks/${block.id}/image`, new Uint8Array(20 * 1024 * 1024 + 1), { 'content-type': 'image/png' });
    expect(big.status).toBe(413);
    const empty = await call('PUT', `/api/blocks/${block.id}/image`, new Uint8Array(0), { 'content-type': 'image/png' });
    expect(empty.status).toBe(400);
    expect(added).toEqual([]);
    expect((await call('GET', `/api/boards/${board.id}`).then((r) => r.json())).blocks[0].resources).toEqual([]);
  });

  it('stores an image, notifies the caption job and serves the bytes', async () => {
    const { call, added } = setup();
    const { board } = await (await call('POST', '/api/projects')).json();
    const block = await (await call('POST', `/api/boards/${board.id}/blocks`, { type: 'image', rect: { x: 0, y: 0, w: 10, h: 10 } })).json();
    const res = await call('PUT', `/api/blocks/${block.id}/image`, new Uint8Array([9, 8, 7]), { 'content-type': 'image/png' });
    expect(res.status).toBe(200);
    const updated = await res.json();
    const resourceId = updated.resources[0].id;
    expect(added).toEqual([resourceId]);
    const file = await call('GET', `/api/files/${resourceId}`);
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]));
  });

  it('marks captions as user-edited', async () => {
    const { call } = setup();
    const { board } = await (await call('POST', '/api/projects')).json();
    const block = await (await call('POST', `/api/boards/${board.id}/blocks`, { type: 'image', rect: { x: 0, y: 0, w: 10, h: 10 } })).json();
    const up = await (await call('PUT', `/api/blocks/${block.id}/image`, new Uint8Array([1]), { 'content-type': 'image/png' })).json();
    const r = await (await call('PATCH', `/api/resources/${up.resources[0].id}/caption`, { title: 'Mine', description: 'D' })).json();
    expect(r.caption).toEqual({ title: 'Mine', description: 'D', userEdited: true });
  });

  it('persists text edits and settings', async () => {
    const { call } = setup();
    const { board } = await (await call('POST', '/api/projects')).json();
    const block = await (await call('POST', `/api/boards/${board.id}/blocks`, { type: 'text', rect: { x: 0, y: 0, w: 10, h: 10 } })).json();
    const t = await (await call('PATCH', `/api/blocks/${block.id}/text`, { content: { richText: { type: 'doc' }, scale: 1, autoSize: false } })).json();
    expect(t.resources[0].kind).toBe('text');
    const s = await (await call('PUT', '/api/settings', { puns: true })).json();
    expect(s.puns).toBe(true);
    expect((await (await call('GET', '/api/settings')).json()).puns).toBe(true);
  });

  it('lists only user and assistant text as chat history', async () => {
    const { call, repo } = setup();
    const { board } = await (await call('POST', '/api/projects')).json();
    repo.appendMessages(board.id, [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: null, tool_calls: [{ id: '1' }] },
      { role: 'tool', content: '{}', tool_call_id: '1' },
      { role: 'assistant', content: 'done' },
    ]);
    expect(await (await call('GET', `/api/boards/${board.id}/messages`)).json()).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'done' },
    ]);
  });
});

describe('review fixes', () => {
  it('rejects text patches on image blocks', async () => {
    const { call } = setup();
    const { board } = await (await call('POST', '/api/projects')).json();
    const block = await (await call('POST', `/api/boards/${board.id}/blocks`, { type: 'image', rect: { x: 0, y: 0, w: 10, h: 10 } })).json();
    expect((await call('PATCH', `/api/blocks/${block.id}/text`, { content: { type: 'doc' } })).status).toBe(400);
    expect((await call('GET', `/api/boards/${board.id}`).then((r) => r.json())).blocks[0].resources).toEqual([]);
  });

  it('rejects svg uploads and serves files with nosniff', async () => {
    const { call } = setup();
    const { board } = await (await call('POST', '/api/projects')).json();
    const block = await (await call('POST', `/api/boards/${board.id}/blocks`, { type: 'image', rect: { x: 0, y: 0, w: 10, h: 10 } })).json();
    expect((await call('PUT', `/api/blocks/${block.id}/image`, new Uint8Array([1]), { 'content-type': 'image/svg+xml' })).status).toBe(415);
    const ok = await (await call('PUT', `/api/blocks/${block.id}/image`, new Uint8Array([1, 2]), { 'content-type': 'image/png' })).json();
    const res = await call('GET', `/api/files/${ok.resources[0].id}`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe('sandbox');
  });
});
