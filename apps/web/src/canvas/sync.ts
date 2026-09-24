import type { Editor } from 'tldraw';
import type { Block, BlockPatch, Board, Viewport } from '@mixboard/shared';
import * as api from '../api/client';
import { createBatcher } from './batcher';
import { blockToShapeInput, fitRect, shapeIdFor, textShapeToContent, type ShapeInput } from './mapping';

/** The parts of a tldraw record this module reads. */
interface RecordLike { typeName: string; id: string; type?: string; x?: number; y?: number; index?: string; props?: any; meta?: Record<string, unknown>; z?: number }
interface StoreEntry { changes: { added: Record<string, RecordLike>; updated: Record<string, [RecordLike, RecordLike]>; removed: Record<string, RecordLike> } }

export interface SyncOptions {
  onSaveError(message: string): void;
}

/**
 * Casts a shape input to the loosely typed partial tldraw expects (custom shape types are not in tldraw's static union).
 * Precondition: `input` is a valid shape input.
 * Postcondition: returns the same object typed for editor calls.
 */
function asPartial(input: ShapeInput): never {
  return input as never;
}

/**
 * Human-readable text for an unknown thrown value.
 * Precondition: none.
 * Postcondition: returns the error message or a string form.
 */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Creates or updates the shape for a block without marking the change as a user edit (so it is not sent back to the server).
 * Precondition: `editor` is mounted.
 * Postcondition: the shape for `block` exists on the current page with the block's data.
 */
export function upsertBlock(editor: Editor, block: Block): void {
  const input = blockToShapeInput(block);
  editor.store.mergeRemoteChanges(() => {
    if (editor.getShape(input.id as never)) editor.updateShape(asPartial(input));
    else editor.createShape(asPartial(input));
  });
}

/**
 * Removes the shape for a block without marking the change as a user edit.
 * Precondition: `editor` is mounted.
 * Postcondition: no shape for `blockId` remains.
 */
export function removeBlockShape(editor: Editor, blockId: string): void {
  const id = shapeIdFor(blockId) as never;
  if (editor.getShape(id)) editor.store.mergeRemoteChanges(() => editor.deleteShape(id));
}

/**
 * Loads a board into the editor: one shape per block (z-order = creation order) and the saved viewport.
 * Precondition: `editor` is mounted and empty.
 * Postcondition: shapes exist for every block and the camera matches `board.viewport`.
 */
function applyBoard(editor: Editor, board: Board): void {
  editor.store.mergeRemoteChanges(() => {
    editor.createShapes(board.blocks.map((b) => asPartial(blockToShapeInput(b))));
  });
  editor.setCamera({ x: board.viewport.x, y: board.viewport.y, z: board.viewport.zoom }, { immediate: true });
}

/**
 * Reads an image file's natural size.
 * Precondition: `file` is a decodable image.
 * Postcondition: returns its pixel width and height; rejects when it cannot be decoded.
 */
async function naturalSize(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/**
 * Keeps the server in step with what the user does on the canvas, and lets the user drop images.
 * Precondition: `editor` is mounted and empty; `board` is the board being shown.
 * Postcondition: shapes and camera are loaded; from now on user edits are sent as debounced partial patches (rect and z-index 400 ms, text 600 ms, viewport 500 ms), user-created text shapes become text blocks, deleted shapes delete their blocks, and dropped or pasted image files become image blocks (placeholder, upload, final). Failures call `options.onSaveError`. Returns a cleanup function that stops listening and flushes pending saves.
 */
export function attachBoardSync(editor: Editor, board: Board, options: SyncOptions): () => void {
  applyBoard(editor, board);

  /**
   * Reports a failed save to the UI.
   * Precondition: none.
   * Postcondition: `options.onSaveError` was called with the error text.
   */
  function report(err: unknown): void {
    options.onSaveError(errorMessage(err));
  }
  /**
   * Sends batched block patches.
   * Precondition: `items` maps block id to patch.
   * Postcondition: one PATCH per block was started; failures are reported.
   */
  function flushPatches(items: Map<string, BlockPatch>): void {
    for (const [id, patch] of items) api.patchBlock(id, patch).catch(report);
  }
  /**
   * Sends batched text edits.
   * Precondition: `items` maps block id to wrapped text content.
   * Postcondition: one text PATCH per block was started; failures are reported.
   */
  function flushTexts(items: Map<string, unknown>): void {
    for (const [id, content] of items) api.patchBlockText(id, content).catch(report);
  }
  /**
   * Sends the latest viewport.
   * Precondition: `items` may contain the key `viewport`.
   * Postcondition: the board's viewport PATCH was started; failures are reported.
   */
  function flushViewport(items: Map<string, Viewport>): void {
    const v = items.get('viewport');
    if (v) api.patchBoard(board.id, { viewport: v }).catch(report);
  }
  const patches = createBatcher<BlockPatch>(flushPatches, 400, (a, b) => ({ ...a, ...b }));
  const texts = createBatcher<unknown>(flushTexts, 600);
  const viewport = createBatcher<Viewport>(flushViewport, 500);

  /**
   * Queues z-index patches from the current stacking order.
   * Precondition: none.
   * Postcondition: every linked shape's block gets `zIndex` = its 1-based position from the bottom.
   */
  function queueZOrder(): void {
    let z = 0;
    for (const s of editor.getCurrentPageShapesSorted()) {
      const blockId = s.meta.blockId as string | undefined;
      if (blockId) patches.queue(blockId, { zIndex: ++z });
    }
  }

  /**
   * Turns a text shape the user just created into a text block.
   * Precondition: `shape` is a `text` shape without `meta.blockId`.
   * Postcondition: a block exists and the shape is linked to it with its current text saved; if the shape vanished meanwhile (tldraw removes empty text shapes) the block is deleted again. Failures are reported.
   */
  async function createTextBlock(shape: RecordLike): Promise<void> {
    try {
      const bounds = editor.getShapePageBounds(shape.id as never);
      if (!bounds) return;
      const block = await api.createBlock(board.id, { type: 'text', rect: { x: bounds.x, y: bounds.y, w: Math.max(1, bounds.w), h: Math.max(1, bounds.h) } });
      const latest = editor.getShape(shape.id as never) as unknown as RecordLike | undefined;
      if (!latest) {
        await api.deleteBlock(block.id);
        return;
      }
      editor.store.mergeRemoteChanges(() => editor.updateShape({ id: shape.id, type: 'text', meta: { blockId: block.id } } as never));
      await api.patchBlockText(block.id, textShapeToContent(latest.props));
    } catch (err) {
      report(err);
    }
  }

  /**
   * Turns dropped or pasted image files into image blocks.
   * Precondition: `files` may contain non-images (ignored).
   * Postcondition: for each image a placeholder shape appears, the file uploads, and the finished block replaces the placeholder. A failed upload removes the placeholder and its block and is reported.
   */
  async function handleDroppedFiles(files: File[], point?: { x: number; y: number }): Promise<void> {
    const origin = point ?? editor.getViewportPageBounds().center;
    let offset = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      let block: Block | null = null;
      try {
        const rect = fitRect(await naturalSize(file), 640, { x: origin.x + offset, y: origin.y + offset });
        block = await api.createBlock(board.id, { type: 'image', name: file.name, rect, status: 'generating' });
        upsertBlock(editor, block);
        upsertBlock(editor, await api.uploadImage(block.id, file));
      } catch (err) {
        if (block) {
          removeBlockShape(editor, block.id);
          await api.deleteBlock(block.id).catch(() => undefined);
        }
        report(err);
      }
      offset += 30;
    }
  }
  editor.registerExternalContentHandler('files', (content) => handleDroppedFiles(content.files, content.point));

  /**
   * Reacts to user edits of shapes.
   * Precondition: `entry` is a tldraw store change from a user action.
   * Postcondition: new unlinked text shapes become blocks; moved/resized shapes queue rect patches; reordered shapes queue z-index patches; edited text queues a content save; deleted linked shapes delete their blocks.
   */
  function handleDocumentChange(entry: StoreEntry): void {
    for (const rec of Object.values(entry.changes.added)) {
      if (rec.typeName === 'shape' && rec.type === 'text' && !rec.meta?.blockId) void createTextBlock(rec);
    }
    let reordered = false;
    for (const [from, to] of Object.values(entry.changes.updated)) {
      const blockId = to.typeName === 'shape' ? (to.meta?.blockId as string | undefined) : undefined;
      if (!blockId) continue;
      const moved = from.x !== to.x || from.y !== to.y || from.props?.w !== to.props?.w || from.props?.h !== to.props?.h;
      if (moved) {
        const b = editor.getShapePageBounds(to.id as never);
        if (b) patches.queue(blockId, { rect: { x: b.x, y: b.y, w: Math.max(1, b.w), h: Math.max(1, b.h) } });
      }
      if (from.index !== to.index) reordered = true;
      if (to.type === 'text' && from.props?.richText !== to.props?.richText) texts.queue(blockId, textShapeToContent(to.props));
    }
    if (reordered) queueZOrder();
    for (const rec of Object.values(entry.changes.removed)) {
      const blockId = rec.typeName === 'shape' ? (rec.meta?.blockId as string | undefined) : undefined;
      if (blockId) api.deleteBlock(blockId).catch(report);
    }
  }

  /**
   * Reacts to camera changes.
   * Precondition: `entry` is a session-scope store change.
   * Postcondition: the latest camera is queued as the board viewport.
   */
  function handleSessionChange(entry: StoreEntry): void {
    for (const [, to] of Object.values(entry.changes.updated)) {
      if (to.typeName === 'camera') viewport.queue('viewport', { x: to.x ?? 0, y: to.y ?? 0, zoom: to.z ?? 1 });
    }
  }

  const stopDocument = editor.store.listen(handleDocumentChange as never, { source: 'user', scope: 'document' });
  const stopSession = editor.store.listen(handleSessionChange as never, { source: 'user', scope: 'session' });
  return () => {
    stopDocument();
    stopSession();
    patches.flushNow();
    texts.flushNow();
    viewport.flushNow();
  };
}
