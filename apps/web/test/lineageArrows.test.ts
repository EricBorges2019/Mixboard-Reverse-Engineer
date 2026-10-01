// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { Block } from '@mixboard/shared';
import { arrowBetween, isHoldKey, isTypingTarget, lineageEdges } from '../src/canvas/lineage';

const block = (id: string, origin: Block['origin'] = null, type: Block['type'] = 'image'): Block => ({
  id, projectId: 'p', boardId: 'bd', type, name: id, rect: { x: 0, y: 0, w: 10, h: 10 }, zIndex: 1,
  prompt: null, aspectRatio: null, status: 'ready', origin, resources: [], createdAt: '', updatedAt: '',
});

describe('arrowBetween', () => {
  it('aims centre to centre and stops at both edges', () => {
    expect(arrowBetween({ x: 0, y: 0, w: 100, h: 100 }, { x: 300, y: 0, w: 100, h: 100 })).toEqual({ x1: 100, y1: 50, x2: 300, y2: 50 });
    expect(arrowBetween({ x: 0, y: 0, w: 100, h: 100 }, { x: 300, y: 300, w: 100, h: 100 })).toEqual({ x1: 100, y1: 100, x2: 300, y2: 300 });
  });
  it('clips against the side the line actually crosses on differently shaped images', () => {
    // A wide source and a tall target, slightly offset: the line leaves through the source's right edge and enters the target's left edge.
    const seg = arrowBetween({ x: 0, y: 0, w: 200, h: 100 }, { x: 400, y: 0, w: 50, h: 200 })!;
    expect(seg.x1).toBe(200);
    expect(seg.x2).toBe(400);
    // A flatter source and a lower target: the line leaves through the source's bottom edge instead.
    expect(arrowBetween({ x: 0, y: 0, w: 200, h: 50 }, { x: 400, y: 100, w: 50, h: 200 })!.y1).toBe(50);
  });
  it('draws nothing when the images overlap along the line', () => {
    expect(arrowBetween({ x: 0, y: 0, w: 100, h: 100 }, { x: 40, y: 40, w: 100, h: 100 })).toBeNull();
    expect(arrowBetween({ x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100 })).toBeNull();
  });
});

describe('lineageEdges', () => {
  it('lists one edge per source and derivative on the board, skipping deleted and text sources', () => {
    const blocks = [
      block('earth'), block('note', null, 'text'),
      block('regen', { action: 'regenerate', sourceBlockIds: ['earth'] }),
      block('combo', { action: 'reference', sourceBlockIds: ['earth', 'regen', 'gone', 'note'] }),
    ];
    expect(lineageEdges(blocks)).toEqual([
      { from: 'earth', to: 'regen' }, { from: 'earth', to: 'combo' }, { from: 'regen', to: 'combo' },
    ]);
  });
});

describe('isHoldKey', () => {
  it('accepts a plain L and rejects modified or other keys', () => {
    expect(isHoldKey(new KeyboardEvent('keydown', { key: 'l' }))).toBe(true);
    expect(isHoldKey(new KeyboardEvent('keydown', { key: 'L' }))).toBe(true);
    expect(isHoldKey(new KeyboardEvent('keydown', { key: 'L', shiftKey: true }))).toBe(false);
    expect(isHoldKey(new KeyboardEvent('keydown', { key: 'l', metaKey: true }))).toBe(false);
    expect(isHoldKey(new KeyboardEvent('keydown', { key: 'k' }))).toBe(false);
  });
});

describe('isTypingTarget', () => {
  it('is true for text fields and editable elements only', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const insideEditable = document.createElement('span');
    editable.append(insideEditable);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(insideEditable)).toBe(true);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
