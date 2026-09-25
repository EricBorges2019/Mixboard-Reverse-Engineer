import { useState } from 'react';
import type { Block } from '@mixboard/shared';
import { Lineage } from './Lineage';

/**
 * Caption editor and lineage for the selected image (D1: users can edit the AI description; D5: lineage).
 * Precondition: `block` is the single selected block, or null; `blocks` are the board's current blocks.
 * Postcondition: with an image block, shows editable title and description, then its lineage (chips call `onFocusBlock`); `Save caption` calls `onSave(resourceId, {title, description})`. Otherwise shows a hint. The draft resets when the selected image or its caption changes.
 */
export function Inspector({ block, blocks, onSave, onFocusBlock }: {
  block: Block | null;
  blocks: Block[];
  onSave(resourceId: string, caption: { title: string; description: string }): Promise<void>;
  onFocusBlock(blockId: string): void;
}) {
  const resource = block?.type === 'image' ? block.resources.find((r) => r.kind === 'image') : undefined;
  if (!block || !resource) return <p className="hint">Select an image to see and edit its caption.</p>;
  return (
    <>
      <CaptionEditor key={`${resource.id}:${resource.caption?.title}:${resource.caption?.description}`} block={block} resourceId={resource.id} caption={resource.caption} onSave={onSave} />
      <Lineage block={block} blocks={blocks} onFocusBlock={onFocusBlock} />
    </>
  );
}

/**
 * The form inside the Inspector, keyed so its draft state resets with the caption.
 * Precondition: `resourceId` belongs to `block`.
 * Postcondition: edits stay local until `Save caption`, which reports success or failure inline.
 */
function CaptionEditor(props: { block: Block; resourceId: string; caption: { title: string; description: string; userEdited: boolean } | null; onSave(resourceId: string, caption: { title: string; description: string }): Promise<void> }) {
  const [title, setTitle] = useState(props.caption?.title ?? '');
  const [description, setDescription] = useState(props.caption?.description ?? '');
  const [message, setMessage] = useState('');
  /**
   * Saves the draft caption.
   * Precondition: none.
   * Postcondition: `onSave` was awaited; the status line says Saved or shows the error.
   */
  async function save(): Promise<void> {
    try {
      await props.onSave(props.resourceId, { title, description });
      setMessage('Saved');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }
  return (
    <div className="inspector">
      <h3>{props.block.name}</h3>
      {!props.caption && <p className="hint">The caption is generated in the background. You can also write your own.</p>}
      <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Description<textarea rows={10} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <button onClick={() => void save()}>Save caption</button>
      {props.caption?.userEdited && <span className="hint"> Edited by you</span>}
      {message && <span className="hint"> {message}</span>}
    </div>
  );
}
