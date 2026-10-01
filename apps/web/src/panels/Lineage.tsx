import type { Block, OriginAction } from '@mixboard/shared';
import { imageLabel } from '../canvas/mapping';

/** How a block's origin reads, looking back at its sources ("Regenerated from X") and forward at it ("Regenerated as Y"). */
const PHRASES: Record<OriginAction, { from: string; as: string }> = {
  regenerate: { from: 'Regenerated from', as: 'Regenerated as' },
  'more-like-this': { from: 'Variant of', as: 'Variants' },
  edit: { from: 'Edited from', as: 'Edited as' },
  reference: { from: 'Made from', as: 'Used in' },
  'remove-background': { from: 'Background removed from', as: 'Background removed as' },
};

/** A block an origin points at, or a placeholder for one that was deleted. */
export type LineageLink = { id: string; label: string } | { id: string; deleted: true };

/**
 * Works out an image's lineage from the board (D5).
 * Precondition: `blocks` are the board's current blocks.
 * Postcondition: `basedOn` is the block's own origin with each source resolved to its label (or marked deleted), or null; `usedBy` lists the blocks whose origin names this block, grouped by action in first-seen order.
 */
export function lineageOf(block: Block, blocks: Block[]): {
  basedOn: { action: OriginAction; sources: LineageLink[] } | null;
  usedBy: { action: OriginAction; blocks: { id: string; label: string }[] }[];
} {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const basedOn = block.origin && {
    action: block.origin.action,
    sources: block.origin.sourceBlockIds.map((id): LineageLink => {
      const source = byId.get(id);
      return source ? { id, label: imageLabel(source) } : { id, deleted: true };
    }),
  };
  const usedBy = new Map<OriginAction, { id: string; label: string }[]>();
  for (const b of blocks) {
    if (!b.origin?.sourceBlockIds.includes(block.id)) continue;
    const group = usedBy.get(b.origin.action) ?? [];
    group.push({ id: b.id, label: imageLabel(b) });
    usedBy.set(b.origin.action, group);
  }
  return { basedOn, usedBy: [...usedBy].map(([action, list]) => ({ action, blocks: list })) };
}

/**
 * The Inspector's "Based on" and "Used by" lines.
 * Precondition: `blocks` are the board's current blocks, including `block`.
 * Postcondition: renders nothing when the image has no lineage; otherwise one line per relation with a chip per related image (clicking calls `onFocusBlock` with its id). Deleted sources show as plain "a deleted image" text; unnamed images as "Untitled image".
 */
export function Lineage({ block, blocks, onFocusBlock }: { block: Block; blocks: Block[]; onFocusBlock(blockId: string): void }) {
  const { basedOn, usedBy } = lineageOf(block, blocks);
  if (!basedOn && usedBy.length === 0) return null;
  /**
   * Renders one related image.
   * Precondition: none.
   * Postcondition: returns a chip that focuses the image, or plain text for a deleted one.
   */
  const chip = (link: LineageLink) => ('deleted' in link
    ? <span key={link.id} className="hint">a deleted image</span>
    : <button key={link.id} type="button" className="chip" onClick={() => onFocusBlock(link.id)}>{link.label || 'Untitled image'}</button>);
  return (
    <div className="lineage">
      {basedOn && <p><span>{PHRASES[basedOn.action].from}</span> {basedOn.sources.map(chip)}</p>}
      {usedBy.map(({ action, blocks: list }) => <p key={action}><span>{PHRASES[action].as}</span> {list.map(chip)}</p>)}
    </div>
  );
}
