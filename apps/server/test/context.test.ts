import { describe, it, expect } from 'vitest';
import { plainTextToDoc, wrapTextContent } from '@mixboard/shared';
import { buildSystemPrompt, describeBlock, withSelection } from '../src/agent/context';
import { PNG_BYTES, makeCtx } from './helpers';

function board() {
  const c = makeCtx();
  const img = c.repo.createBlock(c.board.id, { type: 'image', name: 'Dragon', rect: { x: 450, y: 0, w: 640, h: 360 } });
  const res = c.repo.addResource({ blockId: img.id, kind: 'image', mimeType: 'image/png', bytes: PNG_BYTES });
  c.repo.setCaption(res.id, { title: 'Dragon Scholar', description: 'd' });
  const txt = c.repo.createBlock(c.board.id, { type: 'text', name: 'Note', rect: { x: 0, y: 0, w: 350, h: 100 } });
  c.repo.updateTextContent(txt.id, wrapTextContent(plainTextToDoc('Hello world')));
  return { c, img: c.repo.getBlock(img.id), txt: c.repo.getBlock(txt.id) };
}

describe('context', () => {
  it('describes blocks with a reference, size, position and content', () => {
    const { img, txt } = board();
    expect(describeBlock(img)).toBe(`- [[id:${img.id}|name:Dragon]]: image, 640x360 at (450, 0) — "Dragon Scholar"`);
    expect(describeBlock(txt)).toBe(`- [[id:${txt.id}|name:Note]]: text, 350x100 at (0, 0) — "Hello world"`);
  });
  it('builds a system prompt with persona, board and preloaded skills', () => {
    const { c } = board();
    const prompt = buildSystemPrompt({ persona: 'PERSONA', board: c.repo.getBoard(c.board.id), preloadedSkillMd: ['SKILL A'] });
    expect(prompt).toContain('PERSONA');
    expect(prompt).toContain('Title: Board 1');
    expect(prompt).toContain('## Preloaded skills\nSKILL A');
    const empty = makeCtx();
    expect(buildSystemPrompt({ persona: 'P', board: empty.repo.getBoard(empty.board.id), preloadedSkillMd: [] })).toContain('(empty board)');
  });
  it('appends selected blocks to the message and ignores unknown ids', () => {
    const { c, img } = board();
    const b = c.repo.getBoard(c.board.id);
    expect(withSelection('make it blue', b, [])).toBe('make it blue');
    expect(withSelection('make it blue', b, [img.id, 'ghost'])).toBe(`make it blue\n\nSelected blocks:\n${describeBlock(img)}`);
  });
});
