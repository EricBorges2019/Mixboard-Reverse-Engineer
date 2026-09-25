// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { Editor, createTLStore, defaultAddFontsFromNode, defaultBindingUtils, defaultShapeUtils, tipTapDefaultExtensions, toRichText } from 'tldraw';
import type { Block, Board } from '@mixboard/shared';

let nextId = 0;
const block = (over: Partial<Block>): Block => ({
  id: `b${++nextId}`, projectId: 'p', boardId: 'bd', type: 'image', name: 'Img', rect: { x: 0, y: 0, w: 100, h: 100 }, zIndex: 1,
  prompt: null, aspectRatio: null, status: 'ready', origin: null, resources: [], createdAt: '', updatedAt: '', ...over,
});

vi.mock('../src/api/client', () => ({
  fileUrl: (id: string) => `/api/files/${id}`,
  createBlock: vi.fn(async (_board: string, input: any) => block({ ...input, id: `new${++nextId}` })),
  patchBlock: vi.fn(async () => ({})),
  patchBlockText: vi.fn(async () => ({})),
  patchBoard: vi.fn(async () => ({})),
  deleteBlock: vi.fn(async () => undefined),
  uploadImage: vi.fn(async (id: string) => block({ id })),
}));

import * as api from '../src/api/client';
import { MbImageShapeUtil } from '../src/canvas/MbImageShape';
import { attachBoardSync, removeBlockShape, upsertBlock } from '../src/canvas/sync';
import { shapeIdFor } from '../src/canvas/mapping';

const settle = () => new Promise((r) => setTimeout(r, 0));

function setup(blocks: Block[]) {
  const shapeUtils = [...defaultShapeUtils, MbImageShapeUtil];
  const store = createTLStore({ shapeUtils, bindingUtils: defaultBindingUtils });
  const editor = new Editor({ store, shapeUtils, bindingUtils: defaultBindingUtils, tools: [], getContainer: () => document.body,
    textOptions: { tipTapConfig: { extensions: tipTapDefaultExtensions }, addFontsFromNode: defaultAddFontsFromNode } });
  const board: Board = { id: 'bd', projectId: 'p', title: 't', viewport: { x: 0, y: 0, zoom: 1 }, blocks, createdAt: '', updatedAt: '' };
  const errors: string[] = [];
  const upserted: Block[] = [];
  const removed: string[] = [];
  const stop = attachBoardSync(editor, board, { onSaveError: (m) => errors.push(m), onBlockUpserted: (b) => upserted.push(b), onBlockRemoved: (id) => removed.push(id) });
  return { editor, stop, errors, upserted, removed };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe('board sync', () => {
  it('gives a duplicated shape its own block instead of editing the original', async () => {
    const orig = block({});
    const { editor, stop } = setup([orig]);
    editor.duplicateShapes([shapeIdFor(orig.id) as never], { x: 200, y: 0 });
    await settle();
    const copy = editor.getCurrentPageShapes().find((s) => s.id !== shapeIdFor(orig.id))!;
    editor.updateShape({ id: copy.id, type: copy.type, x: 999 } as never);
    stop();
    expect(api.createBlock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.patchBlock).mock.calls.filter(([id]) => id === orig.id)).toEqual([]);
    expect(copy.meta.blockId).not.toBe(orig.id);
    editor.deleteShapes([copy.id]);
    await settle();
    expect(api.deleteBlock).not.toHaveBeenCalledWith(orig.id);
  });

  it('finds a user-created text shape again for agent updates and deletes', async () => {
    const { editor, stop } = setup([]);
    editor.createShape({ type: 'text', x: 5, y: 5, props: { richText: toRichText('hi') } } as never);
    await settle(); await settle();
    const blockId = editor.getCurrentPageShapes()[0].meta.blockId as string;
    expect(blockId).toBeTruthy();
    upsertBlock(editor, block({ id: blockId, type: 'text', rect: { x: 5, y: 5, w: 100, h: 30 } }));
    expect(editor.getCurrentPageShapes()).toHaveLength(1);
    removeBlockShape(editor, blockId);
    expect(editor.getCurrentPageShapes()).toHaveLength(0);
    stop();
  });

  it('restores saved autoSize and converts the page width back to unscaled units', () => {
    const t = block({ type: 'text', rect: { x: 0, y: 0, w: 200, h: 40 }, resources: [{ id: 'r', blockId: 'x', kind: 'text', mimeType: 'text', caption: null, content: { richText: toRichText('a'), scale: 2, autoSize: true } }] });
    const { editor, stop } = setup([t]);
    const shape = editor.getShape(shapeIdFor(t.id) as never) as any;
    expect(shape.props.autoSize).toBe(true);
    expect(shape.props.scale).toBe(2);
    expect(shape.props.w).toBe(100);
    stop();
  });

  it('saves a text shape whose scale changed', () => {
    const t = block({ type: 'text', rect: { x: 0, y: 0, w: 200, h: 40 }, resources: [{ id: 'r', blockId: 'x', kind: 'text', mimeType: 'text', caption: null, content: { richText: toRichText('a'), scale: 1, autoSize: false } }] });
    const { editor, stop } = setup([t]);
    editor.updateShape({ id: shapeIdFor(t.id), type: 'text', props: { scale: 2 } } as never);
    stop();
    expect(vi.mocked(api.patchBlockText).mock.calls.at(-1)).toMatchObject([t.id, { scale: 2 }]);
  });

  it('drops pending patches for a block the user deletes', () => {
    const b = block({});
    const { editor, stop } = setup([b]);
    editor.updateShape({ id: shapeIdFor(b.id), type: 'mb-image', x: 50 } as never);
    editor.deleteShapes([shapeIdFor(b.id) as never]);
    stop();
    expect(api.patchBlock).not.toHaveBeenCalled();
  });

  it('keeps the user rect when an agent update arrives while a move is pending', () => {
    const b = block({});
    const { editor, stop } = setup([b]);
    editor.updateShape({ id: shapeIdFor(b.id), type: 'mb-image', x: 50 } as never);
    upsertBlock(editor, { ...b, status: 'generating' });
    const shape = editor.getShape(shapeIdFor(b.id) as never) as any;
    expect(shape.x).toBe(50);
    expect(shape.props.status).toBe('generating');
    stop();
  });

  it('recreates the block when an undo brings back a deleted shape', async () => {
    const b = block({});
    const { editor, stop } = setup([b]);
    editor.markHistoryStoppingPoint();
    editor.deleteShapes([shapeIdFor(b.id) as never]);
    await settle();
    editor.undo();
    await settle();
    expect(api.createBlock).toHaveBeenCalledTimes(1);
    stop();
  });
  it('tells the board view about blocks the user creates and deletes', async () => {
    const b = block({});
    const { editor, stop, upserted, removed } = setup([b]);
    editor.createShape({ type: 'text', x: 5, y: 5, props: { richText: toRichText('hi') } } as never);
    await settle(); await settle();
    expect(upserted.map((x) => x.type)).toContain('text');
    editor.deleteShapes([shapeIdFor(b.id) as never]);
    expect(removed).toEqual([b.id]);
    stop();
  });
});
