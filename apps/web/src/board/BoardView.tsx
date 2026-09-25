import { useCallback, useMemo, useRef, useState } from 'react';
import type { Editor } from 'tldraw';
import type { AgentEvent, Block, Board, Project, Settings, SettingsPatch } from '@mixboard/shared';
import { patchCaption } from '../api/client';
import { runImageAction } from '../api/imageActions';
import type { ImageAction, ImageActionTarget } from '../canvas/imageActions';
import { lineageEdges, type LineageEdge } from '../canvas/lineage';
import type { LineageOptions } from '../canvas/LineageArrows';
import { BoardCanvas } from '../canvas/BoardCanvas';
import { mergeBlock, shapeIdFor } from '../canvas/mapping';
import { removeBlockShape, upsertBlock } from '../canvas/sync';
import { ChatPanel } from '../chat/ChatPanel';
import { useChat } from '../chat/useChat';
import { Inspector } from '../panels/Inspector';
import { SettingsPanel } from '../panels/SettingsPanel';
import { StyleBank } from '../panels/StyleBank';
import { useCaptionPolling } from './useCaptionPolling';
import { useSelectedBlockIds } from './useSelectedBlockIds';

type Tab = 'chat' | 'inspector' | 'styles' | 'settings';
const STYLE_TOOLS = new Set(['save_style', 'delete_style']);
const ACTION_LABELS: Record<ImageAction, string> = { regenerate: 'Regenerate', 'more-like-this': 'More like this', retry: 'Try again' };

/**
 * One board: canvas on the left, tabbed side panel on the right.
 * Precondition: `initialBoard` is loaded and `settings` are loaded; the component is keyed by board id.
 * Postcondition: agent events update the canvas (blocks added, finished, deleted) and the style list; selection feeds the agent and the Inspector; captions that arrive later update image labels; a banner reports failed saves.
 */
export function BoardView({ project, initialBoard, settings, updateSettings }: { project: Project; initialBoard: Board; settings: Settings; updateSettings(patch: SettingsPatch): Promise<void> }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [blocks, setBlocks] = useState<Block[]>(initialBoard.blocks);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);
  const [tab, setTab] = useState<Tab>('chat');
  const selectedIds = useSelectedBlockIds(editor);
  const selectedRef = useRef<string[]>([]);
  selectedRef.current = selectedIds;

  /**
   * Applies a block from the server to state and canvas.
   * Precondition: none.
   * Postcondition: the block list and the canvas shape both reflect `block`.
   */
  const applyBlock = useCallback((block: Block) => {
    setBlocks((prev) => mergeBlock(prev, block));
    if (editor) upsertBlock(editor, block);
  }, [editor]);

  /**
   * Records a block the user created on the canvas, so the Inspector, style learning and caption polling see it.
   * Precondition: none.
   * Postcondition: `blocks` contains `block` (the canvas already shows it).
   */
  const onCanvasBlock = useCallback((block: Block) => setBlocks((prev) => mergeBlock(prev, block)), []);

  /**
   * Forgets a block the user deleted on the canvas.
   * Precondition: none.
   * Postcondition: `blocks` no longer contains `blockId`.
   */
  const onCanvasBlockRemoved = useCallback((blockId: string) => setBlocks((prev) => prev.filter((b) => b.id !== blockId)), []);

  /**
   * Reacts to an agent event.
   * Precondition: none.
   * Postcondition: `block` events add or update shapes; `block_deleted` removes them; style tool results refresh the style list.
   */
  const onAgentEvent = useCallback((e: AgentEvent) => {
    if (e.type === 'block') applyBlock(e.block);
    else if (e.type === 'block_deleted') {
      setBlocks((prev) => prev.filter((b) => b.id !== e.blockId));
      if (editor) removeBlockShape(editor, e.blockId);
    } else if (e.type === 'tool_result' && STYLE_TOOLS.has(e.name)) setStyleVersion((v) => v + 1);
  }, [applyBlock, editor]);

  const chat = useChat({
    projectId: project.id,
    boardId: initialBoard.id,
    puns: settings.puns,
    onEvent: onAgentEvent,
    /**
     * Reads the current canvas selection at send time.
     * Precondition: none.
     * Postcondition: returns the selected block ids (possibly empty).
     */
    getSelectedBlockIds: () => selectedRef.current,
  });
  useCaptionPolling(initialBoard.id, blocks, applyBlock);

  /**
   * Runs an image action (the toolbar's Regenerate and More like this, or a failed image's Try again), independently of the chat.
   * Precondition: `target` is an image block on this board (ready, or failed for Try again).
   * Postcondition: streamed blocks are applied to state and canvas as they arrive; a failure (refused request, dropped connection or a failed generation) shows in the banner.
   */
  const onImageAction = useCallback((action: ImageAction, target: ImageActionTarget) => {
    /**
     * Reports a failed action in the banner.
     * Precondition: none.
     * Postcondition: the banner names the action and shows `message`.
     */
    const fail = (message: string) => setSaveError(`${ACTION_LABELS[action]} failed: ${message}`);
    runImageAction(action, target.blockId, (e) => {
      if (e.type === 'block') applyBlock(e.block);
      else if (e.type === 'error') fail(e.message);
    }).catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
  }, [applyBlock]);

  /**
   * Returns to the project list (the ☰ menu's "All projects").
   * Precondition: none.
   * Postcondition: navigates to `#/` (unmounting the board flushes pending canvas saves); while the agent is working the user is asked first, since leaving stops its reply. Image actions keep running on the server either way.
   */
  const leave = useCallback(() => {
    if (chat.state.running && !window.confirm('The agent is still working. Leave and stop it?')) return;
    window.location.hash = '#/';
  }, [chat.state.running]);

  /**
   * Selects a block and zooms to it (used by chat chips).
   * Precondition: none; unknown ids are ignored.
   * Postcondition: the block's shape is selected and in view.
   */
  function focusBlock(blockId: string): void {
    if (!editor || !editor.getShape(shapeIdFor(blockId) as never)) return;
    editor.select(shapeIdFor(blockId) as never);
    editor.zoomToSelection({ animation: { duration: 200 } });
  }

  /**
   * Saves an edited caption and refreshes the block.
   * Precondition: `resourceId` belongs to a block on this board.
   * Postcondition: the caption is stored (userEdited=true) and the local block and its label are updated.
   */
  async function saveCaption(resourceId: string, caption: { title: string; description: string }): Promise<void> {
    const resource = await patchCaption(resourceId, caption);
    const block = blocks.find((b) => b.id === resource.blockId);
    if (block) applyBlock({ ...block, resources: block.resources.map((r) => (r.id === resource.id ? resource : r)) });
  }

  // Keyed by content so the arrows only re-render when lineage itself changes, not on every block update.
  const edgesKey = JSON.stringify(lineageEdges(blocks));
  const lineage = useMemo<LineageOptions>(
    () => ({ edges: JSON.parse(edgesKey) as LineageEdge[], always: settings.showLineage, fade: settings.lineageFade }),
    [edgesKey, settings.showLineage, settings.lineageFade],
  );

  const selectedBlock = selectedIds.length === 1 ? blocks.find((b) => b.id === selectedIds[0]) ?? null : null;
  const selectedImages = selectedIds.filter((id) => blocks.find((b) => b.id === id)?.type === 'image');

  return (
    <div className="board-view">
      <div className="canvas">
        {saveError && (
          <div className="banner" role="alert">
            Unsaved changes: {saveError} <button onClick={() => setSaveError(null)}>Dismiss</button>
          </div>
        )}
        <BoardCanvas
          board={initialBoard}
          onReady={setEditor}
          onLeave={leave}
          onImageAction={onImageAction}
          lineage={lineage}
          onSaveError={setSaveError}
          onBlockUpserted={onCanvasBlock}
          onBlockRemoved={onCanvasBlockRemoved}
        />
      </div>
      <aside className="side">
        <nav className="tabs">
          {(['chat', 'inspector', 'styles', 'settings'] as Tab[]).map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'chat' ? 'Chat' : t === 'inspector' ? 'Inspector' : t === 'styles' ? 'Styles' : 'Settings'}</button>
          ))}
        </nav>
        {/* The chat stays mounted so a running turn is not interrupted when switching tabs. */}
        <div hidden={tab !== 'chat'} className="tab-body"><ChatPanel chat={chat} blockCount={blocks.length} onFocusBlock={focusBlock} /></div>
        {tab === 'inspector' && <div className="tab-body"><Inspector block={selectedBlock} blocks={blocks} onSave={saveCaption} onFocusBlock={focusBlock} /></div>}
        {tab === 'styles' && (
          <div className="tab-body">
            <StyleBank
              projectId={project.id}
              refreshKey={styleVersion}
              canCreate={selectedImages.length > 0 && !chat.state.running}
              onCreate={() => { setTab('chat'); void chat.send('Create a style from the selected images.', 1); }}
            />
          </div>
        )}
        {tab === 'settings' && <div className="tab-body"><SettingsPanel settings={settings} update={updateSettings} /></div>}
      </aside>
    </div>
  );
}
