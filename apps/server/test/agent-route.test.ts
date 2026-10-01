import { afterEach, describe, it, expect } from 'vitest';
import { buildSkills } from '../src/agent/skills/definitions';
import { SkillRegistry } from '../src/agent/skills/registry';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { OpenRouterLlm } from '../src/llm/openrouter';
import { chatReply, startFakeOpenRouter } from './fakeOpenRouter';
import { makeRepo } from './helpers';

let closers: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(closers.map((c) => c())); closers = []; });

async function setup() {
  const fake = await startFakeOpenRouter([chatReply({ content: 'Hello!' })]);
  closers.push(fake.close);
  const { repo } = makeRepo();
  const board = repo.createBoard(repo.createProject().id);
  const config = loadConfig({});
  const agent = { repo, llm: new OpenRouterLlm({ apiKey: 'k', baseUrl: fake.url }), registry: new SkillRegistry(buildSkills()), config, onImageAdded: () => {} };
  const app = createApp({ repo, config, onImageAdded: () => {}, agent });
  const post = (body: unknown) => app.request('/api/agent/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { fake, board, post };
}

describe('POST /api/agent/run', () => {
  it('rejects blank messages with 400 and never calls the model', async () => {
    const s = await setup();
    for (const message of ['', '   \n ']) {
      const res = await s.post({ projectId: s.board.projectId, boardId: s.board.id, message });
      expect(res.status).toBe(400);
    }
    expect(s.fake.requests).toHaveLength(0);
  });
  it('returns 404 for an unknown board', async () => {
    const s = await setup();
    expect((await s.post({ projectId: 'p', boardId: 'nope', message: 'hi' })).status).toBe(404);
  });
  it('streams events as SSE and ends with done', async () => {
    const s = await setup();
    const res = await s.post({ projectId: s.board.projectId, boardId: s.board.id, message: 'hi' });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const body = await res.text();
    expect(body).toContain('event: text');
    expect(body).toContain('"text":"Hello!"');
    expect(body.trimEnd().endsWith('data: {"type":"done"}')).toBe(true);
  });
});
