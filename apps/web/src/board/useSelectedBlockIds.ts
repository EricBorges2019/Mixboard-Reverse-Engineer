import { useValue, type Editor } from 'tldraw';

/**
 * Block ids of the shapes currently selected on the canvas.
 * Precondition: `editor` may be null before the canvas mounts.
 * Postcondition: returns the `meta.blockId` of each selected shape that has one, re-rendering the caller when the selection changes.
 */
export function useSelectedBlockIds(editor: Editor | null): string[] {
  return useValue(
    'selected block ids',
    () => (editor ? editor.getSelectedShapes().flatMap((s) => (typeof s.meta.blockId === 'string' ? [s.meta.blockId] : [])) : []),
    [editor],
  );
}
