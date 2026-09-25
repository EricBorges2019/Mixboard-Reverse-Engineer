import { createContext, useCallback, useContext } from 'react';
import { TldrawUiButtonLabel, TldrawUiContextualToolbar, TldrawUiToolbarButton, useEditor, useValue } from 'tldraw';
import { imageActionTarget, type ImageAction, type ImageActionTarget } from './imageActions';

/** Starts an image action; provided by BoardView, which owns the board state the results land in. */
export const ImageActionContext = createContext<(action: ImageAction, target: ImageActionTarget) => void>(() => {});

/**
 * The floating toolbar above a selected image: Regenerate and More like this.
 * Precondition: rendered inside <Tldraw> (it is the InFrontOfTheCanvas component) under an ImageActionContext provider.
 * Postcondition: shows only while exactly one ready image is selected and the select tool is idle (not while dragging or resizing); each button starts that action for the image. Buttons stay enabled while the agent or other actions run: every click is an independent job.
 */
export function ImageToolbar() {
  const editor = useEditor();
  const runAction = useContext(ImageActionContext);
  // Compare by value: imageActionTarget returns a fresh object on every recompute.
  const targetKey = useValue('mb image action target', () => JSON.stringify(imageActionTarget(editor)), [editor]);
  const idle = useValue('mb image toolbar idle', () => editor.isInAny('select.idle', 'select.pointing_shape'), [editor]);

  /**
   * Gives tldraw the full selection box to place the toolbar above (clamped on screen).
   * Precondition: none.
   * Postcondition: returns the selection's screen bounds, or undefined with no selection. Not a zero-height top edge like tldraw's image toolbar: tldraw hides the toolbar when the box's middle is off screen, which would hide it for any image whose top is scrolled out of view.
   */
  const getSelectionBounds = useCallback(() => editor.getSelectionScreenBounds(), [editor]);

  const target = JSON.parse(targetKey) as ReturnType<typeof imageActionTarget>;
  if (!target || !idle) return null;
  return (
    <TldrawUiContextualToolbar className="mb-image-toolbar" label="Image actions" getSelectionBounds={getSelectionBounds}>
      <TldrawUiToolbarButton type="menu" onClick={() => runAction('regenerate', target)}>
        <TldrawUiButtonLabel>↻ Regenerate</TldrawUiButtonLabel>
      </TldrawUiToolbarButton>
      <TldrawUiToolbarButton type="menu" onClick={() => runAction('more-like-this', target)}>
        <TldrawUiButtonLabel>⧉ More like this</TldrawUiButtonLabel>
      </TldrawUiToolbarButton>
    </TldrawUiContextualToolbar>
  );
}
