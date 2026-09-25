import { Tldraw, type Editor, type TLComponents, type TLUiOverrides } from 'tldraw';
import 'tldraw/tldraw.css';
import type { Board } from '@mixboard/shared';
import type { ImageAction, ImageActionTarget } from './imageActions';
import { ImageActionContext, ImageToolbar } from './ImageToolbar';
import { LineageArrows, LineageContext, type LineageOptions } from './LineageArrows';
import { LeaveBoardContext, MainMenu, MENU_TRANSLATIONS } from './MainMenu';
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
  translations: { en: MENU_TRANSLATIONS },
};

const components: TLComponents = {
  StylePanel: null, PageMenu: null, HelpMenu: null,
  MainMenu, DebugPanel: null, DebugMenu: null,
  InFrontOfTheCanvas: ImageToolbar,
  OnTheCanvas: LineageArrows,
};

/**
 * The tldraw canvas for one board.
 * Precondition: `board` is loaded; the component is keyed by board id so it remounts per board.
 * Postcondition: renders the canvas with the ☰ menu ("All projects" calls `onLeave`), the image action toolbar (its buttons call `onImageAction`) and the lineage arrows (`lineage`), loads the board's blocks, keeps the server in sync, and calls `onReady` with the editor. In non-production builds the editor is also exposed as `window.__mbEditor` for tests.
 */
export function BoardCanvas({ board, onReady, onLeave, onImageAction, lineage, ...sync }: {
  board: Board;
  onReady(editor: Editor): void;
  onLeave(): void;
  onImageAction(action: ImageAction, target: ImageActionTarget): void;
  lineage: LineageOptions;
} & SyncOptions) {
  return (
    // Contexts rather than props: `components` must stay a stable module constant, or tldraw remounts its UI.
    <LeaveBoardContext.Provider value={onLeave}>
      <ImageActionContext.Provider value={onImageAction}>
        <LineageContext.Provider value={lineage}>
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
        </LineageContext.Provider>
      </ImageActionContext.Provider>
    </LeaveBoardContext.Provider>
  );
}
