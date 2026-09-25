import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { readPrompt } from '../src/agent/prompts';
import { SkillRegistry, defineTool, metaTools, type Skill } from '../src/agent/skills/registry';
import { makeCtx } from './helpers';

const fake = (name: string, hidden = false): Skill => ({
  name, description: `${name} desc`, skillMd: `# ${name}`, hidden,
  tools: [defineTool({ name: `${name}_tool`, description: 'd', schema: z.object({ a: z.string() }), run: async ({ a }) => a })],
});

describe('SkillRegistry', () => {
  const reg = new SkillRegistry([fake('one'), fake('two', true)]);

  it('lists only non-hidden skills as XML', () => {
    expect(reg.listSkillsXml()).toBe('<available_skills>\n<skill>\n<name>\none\n</name>\n<description>\none desc\n</description>\n</skill>\n</available_skills>');
  });
  it('hides hidden skills outside onboarding and reports unknown ones', () => {
    expect(reg.load('one', false)).toMatchObject({ skill: { name: 'one' } });
    expect(reg.load('two', false)).toEqual({ error: "Skill 'two' not found.", error_code: 'SKILL_NOT_FOUND' });
    expect(reg.load('two', true)).toMatchObject({ skill: { name: 'two' } });
    expect(reg.load('nope', true)).toEqual({ error: "Skill 'nope' not found.", error_code: 'SKILL_NOT_FOUND' });
  });
  it('exposes tools only for loaded skills', () => {
    expect(reg.toolsFor(new Set(['one'])).map((t) => t.name)).toEqual(['one_tool']);
    expect(reg.toolsFor([])).toEqual([]);
  });
});

describe('defineTool', () => {
  it('derives a JSON schema without $schema and validates arguments', async () => {
    const t = fake('one').tools[0];
    expect(t.parameters).toMatchObject({ type: 'object', properties: { a: { type: 'string' } } });
    expect('$schema' in t.parameters).toBe(false);
    await expect(t.run({}, makeCtx().ctx)).rejects.toThrow();
  });
});

describe('meta tools', () => {
  it('list_skills returns the XML and load_skill unlocks a skill and returns its text', async () => {
    const { ctx } = makeCtx({ registry: new SkillRegistry([fake('one')]) });
    const list = metaTools.find((t) => t.name === 'list_skills')!;
    const load = metaTools.find((t) => t.name === 'load_skill')!;
    expect(await list.run({}, ctx)).toContain('<name>\none\n</name>');
    expect(await load.run({ skill_name: 'one' }, ctx)).toBe('# one');
    expect(ctx.session.loadedSkills.has('one')).toBe(true);
    expect(await load.run({ skill_name: 'zzz' }, ctx)).toMatchObject({ error_code: 'SKILL_NOT_FOUND' });
  });
});

describe('readPrompt', () => {
  it('reads files from the repo prompts directory', () => {
    expect(readPrompt('persona.md')).toContain('Mixboard');
    expect(readPrompt('skills/style-skill.md')).toContain('Style Extraction');
    expect(readPrompt('skills/board-starter-skill.md')).toContain('Kick-start an empty board');
  });
});
