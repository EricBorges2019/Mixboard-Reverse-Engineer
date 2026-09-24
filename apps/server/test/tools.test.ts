import { describe, it, expect } from 'vitest';
import { docToPlainText } from '@mixboard/shared';
import { boardTools } from '../src/agent/tools/board';
import { clarificationTools } from '../src/agent/tools/clarification';
import { styleTools } from '../src/agent/tools/style';
import { textTools } from '../src/agent/tools/text';
import type { ToolDef } from '../src/agent/skills/registry';
import { ScriptedLlm, makeCtx } from './helpers';

const tool = (tools: ToolDef[], name: string) => tools.find((t) => t.name === name)!;
const rect = { x: 0, y: 0, w: 100, h: 50 };

describe('board tools', () => {
  it('set_board_title renames the board', async () => {
    const { ctx, repo, board } = makeCtx();
    expect(await tool(boardTools, 'set_board_title').run({ title: 'Dragons' }, ctx)).toBe('Board title set to: Dragons');
    expect(repo.getBoard(board.id).title).toBe('Dragons');
  });
  it('delete_block removes a block and emits block_deleted', async () => {
    const { ctx, repo, board, events } = makeCtx();
    const b = repo.createBlock(board.id, { type: 'text', rect });
    await tool(boardTools, 'delete_block').run({ block_id: b.id }, ctx);
    expect(repo.getBoard(board.id).blocks).toEqual([]);
    expect(events).toEqual([{ type: 'block_deleted', blockId: b.id }]);
  });
  it('delete_block refuses blocks from another board', async () => {
    const { ctx, repo, project } = makeCtx();
    const other = repo.createBoard(project.id);
    const b = repo.createBlock(other.id, { type: 'text', rect });
    await expect(tool(boardTools, 'delete_block').run({ block_id: b.id }, ctx)).rejects.toThrow(/not on this board/);
    expect(repo.getBlock(b.id)).toBeDefined();
  });
});

describe('text tools', () => {
  it('create_text_block applies defaults, stores wrapped rich text and emits the block', async () => {
    const { ctx, repo, events } = makeCtx();
    const out = (await tool(textTools, 'create_text_block').run({ generated_text_content: 'Hello\nWorld', name: 'Note' }, ctx)) as { block_id: string; name: string };
    const block = repo.getBlock(out.block_id);
    expect(block.rect).toEqual({ x: 0, y: 0, w: 350, h: 100 });
    expect(block.name).toBe('Note');
    expect(block.resources[0].content).toMatchObject({ scale: 1, autoSize: false });
    expect(docToPlainText(block.resources[0].content)).toBe('Hello\nWorld');
    expect(events).toEqual([{ type: 'block', block, isPlaceholder: false }]);
  });
  it('update_text_block replaces the text and rejects image blocks', async () => {
    const { ctx, repo, board } = makeCtx();
    const out = (await tool(textTools, 'create_text_block').run({ generated_text_content: 'old' }, ctx)) as { block_id: string };
    await tool(textTools, 'update_text_block').run({ update_block_id: out.block_id, generated_text_content: 'new' }, ctx);
    expect(docToPlainText(repo.getBlock(out.block_id).resources[0].content)).toBe('new');
    const img = repo.createBlock(board.id, { type: 'image', rect });
    await expect(tool(textTools, 'update_text_block').run({ update_block_id: img.id, generated_text_content: 'x' }, ctx)).rejects.toThrow(/text block/);
  });
});

describe('ask_clarification', () => {
  const q = (n: number) => ({ question: 'Focus?', suggestions: Array.from({ length: n }, (_, i) => `opt ${i}`) });
  it('emits the form and ends the turn', async () => {
    const { ctx, events } = makeCtx();
    const result = await tool(clarificationTools, 'ask_clarification').run({ questions: [q(4), q(4)] }, ctx);
    expect(result).toEqual({ status: 'awaiting_user_response' });
    expect(ctx.session.endTurn).toBe(true);
    expect(events[0]).toMatchObject({ type: 'clarification', questions: [{ question: 'Focus?' }, { question: 'Focus?' }] });
  });
  it('rejects questions without exactly four suggestions so the model retries', async () => {
    const { ctx } = makeCtx();
    await expect(tool(clarificationTools, 'ask_clarification').run({ questions: [q(3)] }, ctx)).rejects.toThrow();
  });
});

describe('style tools', () => {
  it('save_style stores the style and generates a preview', async () => {
    const { ctx, repo, project, llm } = makeCtx();
    const result = await tool(styleTools, 'save_style').run({ style_content: '**Mood**: warm', style_name: 'Classic Oil' }, ctx);
    expect(result).toBe('Style "Classic Oil" saved successfully.');
    const [style] = repo.listStyles(project.id);
    expect(style).toMatchObject({ name: 'Classic Oil', hasPreview: true });
    expect((llm as ScriptedLlm).imageCalls[0].prompt).toContain('**Mood**: warm');
  });
  it('save_style still succeeds when the preview fails', async () => {
    const llm = new ScriptedLlm([], () => { throw new Error('boom'); });
    const { ctx, repo, project } = makeCtx({ llm });
    await tool(styleTools, 'save_style').run({ style_content: 'x' }, ctx);
    expect(repo.listStyles(project.id)[0]).toMatchObject({ name: 'style', hasPreview: false });
  });
  it('get_style and delete_style work by id', async () => {
    const { ctx, repo, project } = makeCtx();
    const s = repo.saveStyle({ projectId: project.id, name: 'A', content: 'c' });
    expect(await tool(styleTools, 'get_style').run({ artifact_id: s.id }, ctx)).toEqual({ name: 'A', content: 'c' });
    expect(await tool(styleTools, 'get_style').run({ artifact_id: 'nope' }, ctx)).toEqual({ error: 'Style nope not found.' });
    await tool(styleTools, 'delete_style').run({ artifact_id: s.id }, ctx);
    expect(repo.listStyles(project.id)).toEqual([]);
  });
});
