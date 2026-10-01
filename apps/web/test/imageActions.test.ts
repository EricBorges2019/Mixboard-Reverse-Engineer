// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Editor, createShapeId, createTLStore, defaultAddFontsFromNode, defaultBindingUtils, defaultShapeUtils, tipTapDefaultExtensions } from 'tldraw';
import { MbImageShapeUtil } from '../src/canvas/MbImageShape';
import { imageActionTarget } from '../src/canvas/imageActions';

/** A headless editor with two image shapes: `ready` (block b-ready) and `busy` (still generating). */
function setup() {
  const shapeUtils = [...defaultShapeUtils, MbImageShapeUtil];
  const store = createTLStore({ shapeUtils, bindingUtils: defaultBindingUtils });
  const editor = new Editor({ store, shapeUtils, bindingUtils: defaultBindingUtils, tools: [], getContainer: () => document.body,
    textOptions: { tipTapConfig: { extensions: tipTapDefaultExtensions }, addFontsFromNode: defaultAddFontsFromNode } });
  const ready = createShapeId('b-ready');
  const busy = createShapeId('b-busy');
  editor.createShapes([
    { id: ready, type: 'mb-image', x: 0, y: 0, props: { w: 100, h: 100, src: '/f.png', title: 'Mandrill Portrait', status: 'ready' }, meta: { blockId: 'b-ready' } },
    { id: busy, type: 'mb-image', x: 200, y: 0, props: { w: 100, h: 100, src: '', title: 'Pending', status: 'generating' }, meta: { blockId: 'b-busy' } },
  ]);
  return { editor, ready, busy };
}

describe('imageActionTarget', () => {
  it('returns the block of a single selected ready image', () => {
    const { editor, ready } = setup();
    editor.select(ready);
    expect(imageActionTarget(editor)).toEqual({ blockId: 'b-ready', name: 'Mandrill Portrait' });
  });
  it('returns null for no selection, several shapes, or an image that is not ready', () => {
    const { editor, ready, busy } = setup();
    expect(imageActionTarget(editor)).toBeNull();
    editor.select(ready, busy);
    expect(imageActionTarget(editor)).toBeNull();
    editor.select(busy);
    expect(imageActionTarget(editor)).toBeNull();
  });
});
