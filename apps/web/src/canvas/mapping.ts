import { plainTextToDoc, unwrapTextContent, type Block, type Rect } from '@mixboard/shared';
import { fileUrl } from '../api/client';

export interface ShapeInput {
  id: string;
  type: 'mb-image' | 'text';
  x: number;
  y: number;
  props: Record<string, unknown>;
  meta: { blockId: string };
}

/**
 * tldraw shape id for a block.
 * Precondition: none.
 * Postcondition: returns `shape:<blockId>` (tldraw's required id format).
 */
export function shapeIdFor(blockId: string): string {
  return `shape:${blockId}`;
}

/**
 * Inverse of shapeIdFor.
 * Precondition: `shapeId` starts with `shape:`.
 * Postcondition: returns the block id.
 */
export function blockIdFromShapeId(shapeId: string): string {
  return shapeId.replace(/^shape:/, '');
}

/**
 * Converts a block into the input for a tldraw shape: images become `mb-image`, text becomes tldraw's native `text` shape.
 * Precondition: `block` is hydrated (resources included).
 * Postcondition: returns a shape input whose `meta.blockId` links it back to the block. Images show the caption title as their label (falling back to the block name) and an empty `src` until a file exists. Text blocks use the stored rich text (bare or wrapped form) or an empty document, plus the saved `scale` and `autoSize`; `w` is the page width divided by `scale`.
 */
export function blockToShapeInput(block: Block): ShapeInput {
  const common = { id: shapeIdFor(block.id), x: block.rect.x, y: block.rect.y, meta: { blockId: block.id } };
  if (block.type === 'image') {
    const resource = block.resources.find((r) => r.kind === 'image');
    return {
      ...common, type: 'mb-image',
      props: { w: block.rect.w, h: block.rect.h, src: resource ? fileUrl(resource.id) : '', title: resource?.caption?.title || block.name, status: block.status },
    };
  }
  const content = block.resources.find((r) => r.kind === 'text')?.content as { scale?: unknown; autoSize?: unknown } | null | undefined;
  const scale = typeof content?.scale === 'number' && content.scale > 0 ? content.scale : 1;
  return {
    ...common, type: 'text',
    props: {
      richText: unwrapTextContent(content) ?? plainTextToDoc(''),
      scale,
      autoSize: content?.autoSize === true,
      // The block rect is in page units; tldraw's `w` is before scaling.
      w: block.rect.w / scale,
    },
  };
}

/**
 * Extracts the storable content of a tldraw text shape.
 * Precondition: `props` are a text shape's props.
 * Postcondition: returns `{richText, scale, autoSize}` (Mixboard's wrapped text format).
 */
export function textShapeToContent(props: { richText: unknown; scale: number; autoSize: boolean }): { richText: unknown; scale: number; autoSize: boolean } {
  return { richText: props.richText, scale: props.scale, autoSize: props.autoSize };
}

/**
 * Sizes an image for the canvas: scaled down to `maxWidth`, never up.
 * Precondition: `size` has positive width and height.
 * Postcondition: returns a rect at `origin` with integer size of at least 1x1 and the original aspect ratio.
 */
export function fitRect(size: { width: number; height: number }, maxWidth: number, origin: { x: number; y: number }): Rect {
  const scale = Math.min(1, maxWidth / size.width);
  return { x: origin.x, y: origin.y, w: Math.max(1, Math.round(size.width * scale)), h: Math.max(1, Math.round(size.height * scale)) };
}

/**
 * Inserts or replaces a block in a list.
 * Precondition: none.
 * Postcondition: returns a new list where the block with the same id is replaced in place, or appended when new.
 */
export function mergeBlock(blocks: Block[], block: Block): Block[] {
  return blocks.some((b) => b.id === block.id) ? blocks.map((b) => (b.id === block.id ? block : b)) : [...blocks, block];
}

/**
 * Stable string of a block's image caption, used to detect caption changes.
 * Precondition: none.
 * Postcondition: equal captions give equal keys; a block without an image caption gives `""`.
 */
export function captionKey(block: Block): string {
  const c = block.resources.find((r) => r.kind === 'image')?.caption;
  return c ? JSON.stringify(c) : '';
}
