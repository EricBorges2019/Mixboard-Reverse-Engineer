import { Tldraw, type Editor, type TLComponents, type TLUiOverrides } from 'tldraw';
import 'tldraw/tldraw.css';
import type { Board } from '@mixboard/shared';
import { MbImageShapeUtil } from './MbImageShape';
import { attachBoardSync, type SyncOptions } from './sync';

declare global {
  interface Window {
    __mbEditor?: Editor;
  }
}

const shapeUtils = [MbImageShapeUtil];

/** Only select, hand and text tools: v1 has no drawing or geometry blocks. */
const overrides: TLUiOverrides = {
  /**
   * Restricts the toolbar to tools that map to blocks.
   * Precondition: `tools` is tldraw's default tool map.
   * Postcondition: returns only select, hand and text.
   */
  tools(_editor, tools) {
    return { select: tools.select, hand: tools.hand, text: tools.text };
  },
};

const components: TLComponents = { StylePanel: null, PageMenu: null, MainMenu: null, HelpMenu: null, DebugPanel: null, DebugMenu: null };

/**
 * The tldraw canvas for one board.
 * Precondition: `board` is loaded; the component is keyed by board id so it remounts per board.
 * Postcondition: renders the canvas, loads the board's blocks, keeps the server in sync, and calls `onReady` with the editor. In non-production builds the editor is also exposed as `window.__mbEditor` for tests.
 */
export function BoardCanvas({ board, onReady, ...sync }: { board: Board; onReady(editor: Editor): void } & SyncOptions) {
  return (
    <Tldraw
      shapeUtils={shapeUtils}
      overrides={overrides}
      components={components}
      onMount={(editor) => {
        onReady(editor);
        if (import.meta.env.MODE !== 'production') window.__mbEditor = editor;
        return attachBoardSync(editor, board, sync);
      }}
    />
  );
}
