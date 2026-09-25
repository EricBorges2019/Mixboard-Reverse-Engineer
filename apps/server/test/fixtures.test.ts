import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { AgentEvent } from '@mixboard/shared';
import { buildSkills } from '../src/agent/skills/definitions';
import { metaTools } from '../src/agent/skills/registry';
import { makeCtx } from './helpers';

const capturePath = fileURLToPath(new URL('../../../captures/agent-calls-decoded.txt', import.meta.url));
const hasCapture = existsSync(capturePath);
const capture = hasCapture ? readFileSync(capturePath, 'utf8') : '';
const calls = [...capture.matchAll(/^  CALL: \["([a-z_]+)", (\{.*\})\]\s*$/gm)].map((m) => ({ name: m[1], args: JSON.parse(m[2]) as unknown }));
const tools = new Map([...metaTools, ...buildSkills().flatMap((s) => s.tools)].map((t) => [t.name, t]));
const deferred = new Set(['get_spatial_context', 'create_document_block', 'create_table_block']);

describe.skipIf(!hasCapture)('captured Mixboard tool calls', () => {
  it('finds the calls in the capture file', () => {
    expect(calls.length).toBeGreaterThan(10);
  });
  it('only uses tools we implement or have deferred on purpose', () => {
    const unknown = [...new Set(calls.map((c) => c.name))].filter((n) => !tools.has(n) && !deferred.has(n));
    expect(unknown).toEqual([]);
  });
  it.each(calls.filter((c) => tools.has(c.name)))('our $name schema accepts the real call', ({ name, args }) => {
    const parsed = tools.get(name)!.schema.safeParse(args);
    expect(parsed.error?.message).toBeUndefined();
  });
  it('turns the captured clarification form into a valid stream event', async () => {
    const captured = calls.find((c) => c.name === 'ask_clarification')!;
    const { ctx, events } = makeCtx();
    await tools.get('ask_clarification')!.run(captured.args, ctx);
    expect(AgentEvent.safeParse(events[0]).success).toBe(true);
    expect(events[0]).toMatchObject({ type: 'clarification', questions: [{ question: 'What is the primary focus of this world?' }, { question: 'What artistic style would you prefer?' }] });
  });
});
