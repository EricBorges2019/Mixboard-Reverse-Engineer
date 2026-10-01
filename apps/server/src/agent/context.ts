import { blockRef, docToPlainText, type Block, type Board } from '@mixboard/shared';

/**
 * Describes one block as a single line for the model.
 * Precondition: `b` is a hydrated block.
 * Postcondition: returns `- <ref>: <type>, <w>x<h> at (<x>, <y>)` plus the caption title (images) or first 200 characters of text (text blocks), and the status when it is not `ready`.
 */
export function describeBlock(b: Block): string {
  let line = `- ${blockRef(b.id, b.name || 'Untitled')}: ${b.type}, ${b.rect.w}x${b.rect.h} at (${b.rect.x}, ${b.rect.y})`;
  if (b.status !== 'ready') line += `, status ${b.status}`;
  if (b.type === 'image') {
    const title = b.resources.find((r) => r.kind === 'image')?.caption?.title;
    if (title) line += ` — "${title}"`;
  } else {
    const text = docToPlainText(b.resources.find((r) => r.kind === 'text')?.content);
    if (text) line += ` — "${text.slice(0, 200)}"`;
  }
  return line;
}

/**
 * Builds the system prompt for a turn.
 * Precondition: `persona` is the persona text; `board` is current.
 * Postcondition: returns persona, then a `## Current board` section listing every block (or `(empty board)`), then, when any, a `## Preloaded skills` section.
 */
export function buildSystemPrompt(input: { persona: string; board: Board; preloadedSkillMd: string[] }): string {
  const blocks = input.board.blocks.length ? input.board.blocks.map(describeBlock).join('\n') : '(empty board)';
  const preloaded = input.preloadedSkillMd.length ? `\n\n## Preloaded skills\n${input.preloadedSkillMd.join('\n\n---\n\n')}` : '';
  return `${input.persona}\n\n## Current board\nTitle: ${input.board.title}\n${blocks}${preloaded}`;
}

/**
 * Appends the user's selected blocks to their message.
 * Precondition: none; unknown ids are ignored.
 * Postcondition: returns `message` unchanged when nothing valid is selected, otherwise `message` plus a `Selected blocks:` list.
 */
export function withSelection(message: string, board: Board, selectedIds: string[]): string {
  const selected = board.blocks.filter((b) => selectedIds.includes(b.id));
  return selected.length ? `${message}\n\nSelected blocks:\n${selected.map(describeBlock).join('\n')}` : message;
}
