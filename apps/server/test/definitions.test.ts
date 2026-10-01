import { describe, it, expect } from 'vitest';
import { buildSkills } from '../src/agent/skills/definitions';
import { SkillRegistry } from '../src/agent/skills/registry';

describe('buildSkills', () => {
  const skills = buildSkills();
  it('lists the five public skills in the original order plus a hidden starter', () => {
    expect(skills.filter((s) => !s.hidden).map((s) => s.name)).toEqual([
      'text-generation-skill', 'core-board-skill', 'image-generation-intent-skill', 'style-skill', 'clarification-skill',
    ]);
    expect(skills.find((s) => s.hidden)?.name).toBe('board-starter-skill');
  });
  it('has non-empty skill text and unique tool names', () => {
    for (const s of skills) expect(s.skillMd.length).toBeGreaterThan(50);
    const names = skills.flatMap((s) => s.tools.map((t) => t.name));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(['create_image_block', 'update_image_block', 'remove_background', 'create_text_block', 'update_text_block', 'set_board_title', 'delete_block', 'ask_clarification', 'save_style', 'get_style', 'delete_style']));
  });
  it('never lists the starter skill', () => {
    expect(new SkillRegistry(skills).listSkillsXml()).not.toContain('board-starter-skill');
  });
});
