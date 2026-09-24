import { describe, it, expect } from 'vitest';
import { plainTextToDoc, wrapTextContent, type Block } from '@mixboard/shared';
import { blockIdFromShapeId, blockToShapeInput, captionKey, fitRect, mergeBlock, shapeIdFor, textShapeToContent } from '../src/canvas/mapping';

const base: Block = {
  id: 'b1', projectId: 'p', boardId: 'bd', type: 'image', name: 'Dragon', rect: { x: 10, y: 20, w: 300, h: 200 }, zIndex: 1,
  prompt: null, aspectRatio: null, status: 'ready', resources: [], createdAt: '', updatedAt: '',
};
const imageResource = { id: 'r1', blockId: 'b1', kind: 'image' as const, mimeType: 'image/png', caption: null, content: null };

describe('blockToShapeInput', () => {
  it('maps an image block with its file URL and caption title', () => {
    const input = blockToShapeInput({ ...base, resources: [{ ...imageResource, caption: { title: 'Dragon Scholar', description: '', userEdited: false } }] });
    expect(input).toEqual({
      id: 'shape:b1', type: 'mb-image', x: 10, y: 20,
      props: { w: 300, h: 200, src: '/api/files/r1', title: 'Dragon Scholar', status: 'ready' },
      meta: { blockId: 'b1' },
    });
  });
  it('falls back to the block name and an empty src while generating', () => {
    const input = blockToShapeInput({ ...base, status: 'generating' });
    expect(input.props).toMatchObject({ src: '', title: 'Dragon', status: 'generating' });
  });
  it('maps a text block to a native tldraw text shape using the stored rich text', () => {
    const doc = plainTextToDoc('Hello');
    const input = blockToShapeInput({ ...base, type: 'text', resources: [{ ...imageResource, kind: 'text', content: wrapTextContent(doc) }] });
    expect(input).toMatchObject({ type: 'text', props: { richText: doc, scale: 1, autoSize: false, w: 300 }, meta: { blockId: 'b1' } });
  });
  it('accepts bare rich-text content and empty text blocks', () => {
    const doc = plainTextToDoc('Bare');
    expect(blockToShapeInput({ ...base, type: 'text', resources: [{ ...imageResource, kind: 'text', content: doc }] }).props.richText).toEqual(doc);
    expect(blockToShapeInput({ ...base, type: 'text' }).props.richText).toEqual(plainTextToDoc(''));
  });
});

describe('helpers', () => {
  it('converts between block and shape ids', () => {
    expect(shapeIdFor('b1')).toBe('shape:b1');
    expect(blockIdFromShapeId('shape:b1')).toBe('b1');
  });
  it('wraps text shape props for storage', () => {
    const doc = plainTextToDoc('x');
    expect(textShapeToContent({ richText: doc, scale: 2, autoSize: true, w: 5 } as any)).toEqual({ richText: doc, scale: 2, autoSize: true });
  });
  it('fits an image to a max width without upscaling', () => {
    expect(fitRect({ width: 1280, height: 720 }, 640, { x: 5, y: 6 })).toEqual({ x: 5, y: 6, w: 640, h: 360 });
    expect(fitRect({ width: 100, height: 50 }, 640, { x: 0, y: 0 })).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });
  it('merges a block into a list by id, preserving order', () => {
    const a = { ...base, id: 'a' };
    const b = { ...base, id: 'b' };
    expect(mergeBlock([a, b], { ...b, name: 'B2' }).map((x) => x.name)).toEqual(['Dragon', 'B2']);
    expect(mergeBlock([a], b).map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('keys captions so changes are detectable', () => {
    const withCaption = { ...base, resources: [{ ...imageResource, caption: { title: 'T', description: 'D', userEdited: false } }] };
    expect(captionKey(withCaption)).not.toBe(captionKey(base));
    expect(captionKey(base)).toBe(captionKey({ ...base }));
  });
});
