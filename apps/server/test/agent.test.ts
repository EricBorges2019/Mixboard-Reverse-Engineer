import { afterEach, describe, it, expect } from 'vitest';
import { AgentRunRequest, type AgentEvent } from '@mixboard/shared';
import { runAgent, type AgentDeps } from '../src/agent/loop';
import { buildSkills } from '../src/agent/skills/definitions';
import { SkillRegistry } from '../src/agent/skills/registry';
import { loadConfig } from '../src/config';
import { OpenRouterLlm } from '../src/llm/openrouter';
import { chatReply, startFakeOpenRouter, type FakeScript } from './fakeOpenRouter';
import { makeRepo } from './helpers';

let closers: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(closers.map((c) => c())); closers = []; });

async function setup(script: FakeScript, maxSteps = 6) {
  const fake = await startFakeOpenRouter(script);
  closers.push(fake.close);
  const { repo } = makeRepo();
  const board = repo.createBoard(repo.createProject().id);
  const deps: AgentDeps = {
    repo,
    llm: new OpenRouterLlm({ apiKey: 'k', baseUrl: fake.url }),
    registry: new SkillRegistry(buildSkills()),
    config: { ...loadConfig({}), maxAgentSteps: maxSteps },
    onImageAdded: () => {},
  };
  const events: AgentEvent[] = [];
  const run = (req: Record<string, unknown> = {}, signal: AbortSignal = new AbortController().signal) =>
    runAgent({ req: AgentRunRequest.parse({ projectId: board.projectId, boardId: board.id, message: 'hello', ...req }), deps, emit: (e) => events.push(e), signal });
  const toolNames = (i: number) => (fake.requests[i].tools ?? []).map((t: any) => t.function.name);
  return { fake, repo, board, events, run, toolNames };
}

describe('runAgent', () => {
  it('answers with plain text and persists the exchange', async () => {
    const s = await setup([chatReply({ content: 'Hi there' })]);
    await s.run();
    expect(s.events).toEqual([{ type: 'text', text: 'Hi there' }]);
    expect(s.toolNames(0)).toEqual(['list_skills', 'load_skill']);
    expect(s.fake.requests[0].messages[0].content).toContain('Mixboard');
    expect(s.repo.listMessages(s.board.id)).toMatchObject([{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'Hi there' }]);
  });

  it('unlocks a skill after load_skill and hides the skill text from the client', async () => {
    const s = await setup([
      chatReply({ tool_calls: [{ name: 'load_skill', args: { skill_name: 'core-board-skill' } }] }),
      chatReply({ tool_calls: [{ name: 'set_board_title', args: { title: 'Dragons' } }] }),
      chatReply({ content: 'Titled it.' }),
    ]);
    await s.run();
    expect(s.events.map((e) => e.type)).toEqual(['tool_call', 'tool_result', 'tool_call', 'tool_result', 'text']);
    expect(s.events[1]).toMatchObject({ name: 'load_skill', result: { skill_name: 'core-board-skill' } });
    expect(s.toolNames(0)).not.toContain('set_board_title');
    expect(s.toolNames(1)).toContain('set_board_title');
    expect(JSON.stringify(s.fake.requests[1].messages)).toContain('Call `set_board_title`');
    expect(s.repo.getBoard(s.board.id).title).toBe('Dragons');
  });

  it('runs parallel tool calls and answers them in order', async () => {
    const note = (n: number) => ({ name: 'create_text_block', args: { generated_text_content: `n${n}`, name: `N${n}` }, id: `call_${n}` });
    const s = await setup([
      chatReply({ tool_calls: [{ name: 'load_skill', args: { skill_name: 'text-generation-skill' } }] }),
      chatReply({ tool_calls: [note(1), note(2), note(3)] }),
      chatReply({ content: 'Three notes.' }),
    ]);
    await s.run();
    expect(s.repo.getBoard(s.board.id).blocks).toHaveLength(3);
    const tail = s.fake.requests[2].messages.slice(-3);
    expect(tail.map((m: any) => m.tool_call_id)).toEqual(['call_1', 'call_2', 'call_3']);
  });

  it('returns unknown tools and malformed arguments to the model as errors and keeps going', async () => {
    const s = await setup([
      chatReply({ tool_calls: [{ name: 'does_not_exist', args: {} }, { name: 'load_skill', args: '{not json', id: 'bad' }] }),
      chatReply({ content: 'Recovered.' }),
    ]);
    await s.run();
    const results = s.events.filter((e) => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>[];
    expect(JSON.stringify(results[0].result)).toContain('not available');
    expect(JSON.stringify(results[1].result)).toContain('valid JSON');
    expect(s.events.some((e) => e.type === 'error')).toBe(false);
    expect(s.events.at(-1)).toEqual({ type: 'text', text: 'Recovered.' });
  });

  it('returns invalid arguments to the model as a tool error', async () => {
    const s = await setup([
      chatReply({ tool_calls: [{ name: 'load_skill', args: { wrong: 1 } }] }),
      chatReply({ content: 'ok' }),
    ]);
    await s.run();
    expect(JSON.stringify((s.events[1] as any).result)).toContain('Invalid arguments');
  });

  it('starts onboarding with a clarification-only turn', async () => {
    const q = { question: 'Focus?', suggestions: ['a', 'b', 'c', 'd'] };
    const s = await setup([chatReply({ tool_calls: [{ name: 'ask_clarification', args: { questions: [q, { ...q, question: 'Style?' }] } }] })]);
    await s.run({ shortcut: 3, message: 'a fantasy town board' });
    expect(s.fake.requests).toHaveLength(1);
    expect(s.fake.requests[0].messages[0].content).toContain('Kick-start an empty board');
    expect(s.toolNames(0)).toContain('ask_clarification');
    expect(s.events.map((e) => e.type)).toEqual(['tool_call', 'clarification', 'tool_result']);
    expect((s.repo.listMessages(s.board.id) as any[]).at(-1).role).toBe('tool');
  });

  it('keeps the board-starter skill loaded for the turn after the clarification answers', async () => {
    const q = { question: 'Focus?', suggestions: ['a', 'b', 'c', 'd'] };
    const s = await setup([
      chatReply({ tool_calls: [{ name: 'ask_clarification', args: { questions: [q, { ...q, question: 'Style?' }] } }] }),
      chatReply({ content: 'ok' }),
    ]);
    await s.run({ shortcut: 3, message: 'a fantasy town board' });
    await s.run({ message: 'castles; watercolor' });
    expect(s.fake.requests[1].messages[0].content).toContain('Kick-start an empty board');
    expect(s.toolNames(1)).toContain('ask_clarification');
  });

  it('ignores the onboarding shortcut on a board that already has blocks', async () => {
    const s = await setup([chatReply({ content: 'ok' })]);
    s.repo.createBlock(s.board.id, { type: 'text', rect: { x: 0, y: 0, w: 10, h: 10 } });
    await s.run({ shortcut: 3 });
    expect(s.fake.requests[0].messages[0].content).not.toContain('Kick-start an empty board');
    expect(s.toolNames(0)).toEqual(['list_skills', 'load_skill']);
  });

  it('cannot load board-starter-skill outside onboarding', async () => {
    const s = await setup([
      chatReply({ tool_calls: [{ name: 'load_skill', args: { skill_name: 'board-starter-skill' } }] }),
      chatReply({ content: 'ok' }),
    ]);
    await s.run();
    expect(JSON.stringify((s.events[1] as any).result)).toContain('SKILL_NOT_FOUND');
  });

  it('stops at the step cap with an error event and stores only complete steps', async () => {
    const s = await setup(() => chatReply({ tool_calls: [{ name: 'list_skills', args: {} }] }), 3);
    await s.run();
    expect(s.fake.requests).toHaveLength(3);
    expect(s.events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('3 steps') });
    const stored = s.repo.listMessages(s.board.id) as any[];
    expect(stored).toHaveLength(1 + 3 * 2);
  });

  it('makes no tagline call when puns are off, and emits one when on', async () => {
    const off = await setup((body) => chatReply({ content: 'plain' }));
    await off.run({ puns: false });
    expect(off.fake.requests.map((r) => r.model)).toEqual(['test/agent']);

    const on = await setup((body) => ({ ...chatReply({ content: body.model === 'test/tagline' ? 'Pun-derful!' : 'done' }), delayMs: body.model === 'test/agent' ? 80 : 0 }));
    await on.run({ puns: true });
    expect(on.events[0]).toEqual({ type: 'tagline', text: 'Pun-derful!' });
    expect(on.fake.requests.map((r) => r.model).sort()).toEqual(['test/agent', 'test/tagline']);
  });

  it('reports model failures as an error event and stores only the user message', async () => {
    const s = await setup([{ status: 500, body: { error: { message: 'upstream down' } } }]);
    await s.run();
    expect(s.events).toEqual([{ type: 'error', message: 'upstream down' }]);
    expect(s.repo.listMessages(s.board.id)).toHaveLength(1);
  });

  it('cancels the upstream request and stays silent when the client disconnects', async () => {
    const s = await setup([{ ...chatReply({ content: 'late' }), delayMs: 400 }]);
    const abort = new AbortController();
    const running = s.run({}, abort.signal);
    setTimeout(() => abort.abort(), 40);
    await running;
    expect(s.events).toEqual([]);
    for (let i = 0; i < 20 && s.fake.aborted() === 0; i++) await new Promise((r) => setTimeout(r, 25));
    expect(s.fake.aborted()).toBe(1);
  });
});
