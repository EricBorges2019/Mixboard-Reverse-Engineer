import type { Block } from '@mixboard/shared';

/**
 * Pure helpers for the lineage arrows (D5): which pairs to connect, where each arrow starts and ends, and which
 * key presses count as "hold L to show".
 */

/** One arrow: from a source image to an image made from it (block ids). */
export interface LineageEdge {
  from: string;
  to: string;
}

/** An axis-aligned rectangle in page coordinates. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Lists the arrows to draw for a board.
 * Precondition: `blocks` are the board's current blocks.
 * Postcondition: returns one edge per (source, derivative) pair where both are image blocks on the board, in block order then source order, without repeats. Deleted sources and non-image sources are skipped.
 */
export function lineageEdges(blocks: Block[]): LineageEdge[] {
  const images = new Set(blocks.filter((b) => b.type === 'image').map((b) => b.id));
  const edges: LineageEdge[] = [];
  for (const b of blocks) {
    if (!b.origin || !images.has(b.id)) continue;
    for (const from of new Set(b.origin.sourceBlockIds)) if (images.has(from)) edges.push({ from, to: b.id });
  }
  return edges;
}

/**
 * Where an arrow between two images starts and ends: on the line between their centres, clipped to each image's edge.
 * Precondition: both rects have positive size.
 * Postcondition: returns the segment from where the centre line leaves `a` to where it enters `b`, or null when the images overlap along that line (including identical centres), since there is then no gap to draw in.
 */
export function arrowBetween(a: Rect, b: Rect): { x1: number; y1: number; x2: number; y2: number } | null {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2, by = b.y + b.h / 2;
  const dx = bx - ax, dy = by - ay;
  /**
   * How much of the centre-to-centre line lies inside a rect centred on one of its ends.
   * Precondition: `dx` and `dy` are not both zero (otherwise both results are Infinity and no arrow is drawn).
   * Postcondition: returns the fraction of the line at which it crosses the rect's first side.
   */
  const inside = (r: Rect) => Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity);
  const ta = inside(a), tb = inside(b);
  if (ta + tb >= 1) return null;
  return { x1: ax + dx * ta, y1: ay + dy * ta, x2: bx - dx * tb, y2: by - dy * tb };
}

/**
 * Whether a key event is the "hold to show lineage" key.
 * Precondition: none.
 * Postcondition: true for L or l with no modifier keys (Shift+L stays tldraw's lock shortcut).
 */
export function isHoldKey(e: KeyboardEvent): boolean {
  return e.key.toLowerCase() === 'l' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
}

/**
 * Whether a key press is typing rather than a canvas shortcut.
 * Precondition: none.
 * Postcondition: true for inputs, text areas, selects and editable elements (the chat box, captions, text blocks being edited).
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}
