import type { Editor } from 'tldraw';
import { blockIdFromShapeId } from './mapping';
import type { MbImageShape } from './MbImageShape';

/**
 * Actions on an image block, all run by the server (api/imageActions), not the agent:
 * - the toolbar's Regenerate and More like this, as in Mixboard (SPEC §4.6), which add new blocks;
 * - Try again on a failed image, which re-runs that block's own generation in place.
 */

/** Each action is also its route segment (`/api/blocks/:id/<action>`). */
export type ImageAction = 'regenerate' | 'more-like-this' | 'retry';

/** The block an action applies to, and its display name. */
export interface ImageActionTarget {
  blockId: string;
  name: string;
}

/**
 * Finds the image the toolbar actions would apply to.
 * Precondition: none.
 * Postcondition: returns the block id and title of the only selected shape when it is an `mb-image` whose image is ready; otherwise null.
 */
export function imageActionTarget(editor: Editor): ImageActionTarget | null {
  const shape = editor.getOnlySelectedShape();
  if (!shape || shape.type !== 'mb-image') return null;
  return imageShapeTarget(shape as MbImageShape, 'ready');
}

/**
 * Describes an image shape as an action target.
 * Precondition: none.
 * Postcondition: returns the shape's block id (from `meta.blockId`, else derived from the shape id) and title when the shape's status is `status`; otherwise null.
 */
export function imageShapeTarget(shape: MbImageShape, status: MbImageShape['props']['status']): ImageActionTarget | null {
  if (shape.props.status !== status) return null;
  return { blockId: (shape.meta.blockId as string | undefined) ?? blockIdFromShapeId(shape.id), name: shape.props.title };
}
