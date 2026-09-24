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

/** Per-editor view of unsent user edits, so server updates do not overwrite them. Registered by attachBoardSync. */
interface PendingEdits { rect(blockId: string): boolean; text(blockId: string): boolean }
const pendingEdits = new WeakMap<Editor, PendingEdits>();

/**
 * Finds the shape linked to a block. Shapes loaded from the server use `shapeIdFor(blockId)`; shapes the user made
 * (drawn text, duplicates, pastes) keep tldraw's own id and are linked only through `meta.blockId`.
 * Precondition: `editor` is mounted.
 * Postcondition: returns the linked shape's id, or null when no shape on the current page is linked to `blockId`.
 */
function findShapeId(editor: Editor, blockId: string): string | null {
  const direct = editor.getShape(shapeIdFor(blockId) as never);
  if (direct && direct.meta.blockId === blockId) return direct.id;
  return editor.getCurrentPageShapes().find((shape) => shape.meta.blockId === blockId)?.id ?? null;
}

/**
 * Creates or updates the shape for a block without marking the change as a user edit (so it is not sent back to the server).
 * Precondition: `editor` is mounted.
 * Postcondition: the shape for `block` exists on the current page with the block's data, except that a position/size or
 * text edit the user has not saved yet is kept rather than overwritten (the pending save then wins on the server too).
 */
export function upsertBlock(editor: Editor, block: Block): void {
  const input = blockToShapeInput(block);
  const existing = findShapeId(editor, block.id);
  const pending = pendingEdits.get(editor);
  editor.store.mergeRemoteChanges(() => {
    if (!existing) {
      editor.createShape(asPartial(input));
      return;
    }
    const props: Record<string, unknown> = { ...input.props };
    const update: Record<string, unknown> = { ...input, id: existing, props };
    if (pending?.rect(block.id)) {
      delete update.x;
      delete update.y;
      delete props.w;
      delete props.h;
    }
    if (pending?.text(block.id)) {
      delete props.richText;
      delete props.scale;
      delete props.autoSize;
      delete props.w;
    }
    editor.updateShape(update as never);
  });
}

/**
 * Removes the shape for a block without marking the change as a user edit.
 * Precondition: `editor` is mounted.
 * Postcondition: no shape linked to `blockId` remains.
 */
export function removeBlockShape(editor: Editor, blockId: string): void {
  const id = findShapeId(editor, blockId);
  if (id) editor.store.mergeRemoteChanges(() => editor.deleteShape(id as never));
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
  pendingEdits.set(editor, {
    /**
     * Tells whether a rect or z-index patch for a block is still waiting to be sent.
     * Precondition: none.
     * Postcondition: returns true while one is queued.
     */
    rect: (id) => patches.has(id),
    /**
     * Tells whether a text save for a block is still waiting to be sent.
     * Precondition: none.
     * Postcondition: returns true while one is queued.
     */
    text: (id) => texts.has(id),
  });

  /**
   * Sets a shape's block link without it counting as a user edit.
   * Precondition: `shapeId` names a shape of type `type`.
   * Postcondition: the shape's `meta.blockId` is `blockId`, or removed when `blockId` is null.
   */
  function setLink(shapeId: string, type: string, blockId: string | null): void {
    editor.store.mergeRemoteChanges(() => editor.updateShape({ id: shapeId, type, meta: blockId ? { blockId } : {} } as never));
  }

  /**
   * Reads a shape's current page rect in block form.
   * Precondition: none.
   * Postcondition: returns the rect (at least 1x1), or null when the shape no longer exists.
   */
  function pageRect(shapeId: string): Block['rect'] | null {
    const b = editor.getShapePageBounds(shapeId as never);
    return b ? { x: b.x, y: b.y, w: Math.max(1, b.w), h: Math.max(1, b.h) } : null;
  }

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
   * Gives a shape the user just added (drawn, duplicated, pasted, or brought back by undo) a block of its own.
   * Copies carry the original's `meta.blockId`, so the link is removed first; until the new block exists the shape is
   * unlinked and its edits are not sent anywhere.
   * Precondition: `shape` is a `text` or `mb-image` shape added by a user action.
   * Postcondition: a new block exists, the shape links to it, and its current text, image and rect are saved. If the shape
   * vanished meanwhile (tldraw removes empty text shapes) the new block is deleted again. Failures are reported.
   */
  async function linkNewShape(shape: RecordLike): Promise<void> {
    setLink(shape.id, shape.type!, null);
    try {
      const rect = pageRect(shape.id);
      if (!rect) return;
      const isImage = shape.type === 'mb-image';
      const created = await api.createBlock(board.id, isImage
        ? { type: 'image', name: shape.props?.title ?? '', rect, status: shape.props?.status === 'error' ? 'error' : 'ready' }
        : { type: 'text', rect });
      const latest = editor.getShape(shape.id as never) as unknown as RecordLike | undefined;
      if (!latest) {
        await api.deleteBlock(created.id);
        return;
      }
      setLink(shape.id, shape.type!, created.id);
      const latestRect = pageRect(shape.id);
      if (latestRect) patches.queue(created.id, { rect: latestRect });
      if (!isImage) {
        await api.patchBlockText(created.id, textShapeToContent(latest.props));
      } else if (latest.props?.src) {
        const blob = await (await fetch(latest.props.src)).blob();
        upsertBlock(editor, await api.uploadImage(created.id, new File([blob], created.name || 'image', { type: blob.type })));
      }
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
   * Postcondition: every added text or image shape gets a new block; moved/resized shapes queue rect patches; reordered shapes queue z-index patches; edited or rescaled text queues a content save; deleted linked shapes drop their pending saves and delete their blocks.
   */
  function handleDocumentChange(entry: StoreEntry): void {
    for (const rec of Object.values(entry.changes.added)) {
      if (rec.typeName === 'shape' && (rec.type === 'text' || rec.type === 'mb-image')) void linkNewShape(rec);
    }
    let reordered = false;
    for (const [from, to] of Object.values(entry.changes.updated)) {
      const blockId = to.typeName === 'shape' ? (to.meta?.blockId as string | undefined) : undefined;
      if (!blockId) continue;
      const textChanged = to.type === 'text' &&
        (from.props?.richText !== to.props?.richText || from.props?.scale !== to.props?.scale || from.props?.autoSize !== to.props?.autoSize);
      // Typing into an auto-sized text or scaling it changes its size without touching x/y/w.
      const moved = textChanged || from.x !== to.x || from.y !== to.y || from.props?.w !== to.props?.w || from.props?.h !== to.props?.h;
      if (moved) {
        const rect = pageRect(to.id);
        if (rect) patches.queue(blockId, { rect });
      }
      if (from.index !== to.index) reordered = true;
      if (textChanged) texts.queue(blockId, textShapeToContent(to.props));
    }
    if (reordered) queueZOrder();
    for (const rec of Object.values(entry.changes.removed)) {
      const blockId = rec.typeName === 'shape' ? (rec.meta?.blockId as string | undefined) : undefined;
      if (!blockId) continue;
      patches.cancel(blockId);
      texts.cancel(blockId);
      api.deleteBlock(blockId).catch(report);
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
    pendingEdits.delete(editor);
    stopDocument();
    stopSession();
    patches.flushNow();
    texts.flushNow();
    viewport.flushNow();
  };
}
