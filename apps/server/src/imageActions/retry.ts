import { nearestRatio, type Block } from '@mixboard/shared';
import { HttpError } from '../errors';
import { generateVariant } from './moreLikeThis';
import { fillRegenerated } from './regenerate';
import { failBlock, findImageSource, type ImageActionDeps, type ImageActionRun } from './source';

/**
 * Checks that a block can be tried again.
 * Precondition: none.
 * Postcondition: returns the block when it is a failed image block with something to replay (a stored prompt, or a Regenerate origin that can write one); throws NotFoundError for an unknown id and HttpError 400 otherwise.
 */
export function loadRetryable(deps: ImageActionDeps, blockId: string): Block {
  const block = deps.repo.getBlock(blockId);
  if (block.type !== 'image' || block.status !== 'error') throw new HttpError(400, 'Only a failed image can be tried again.');
  if (!block.prompt && block.origin?.action !== 'regenerate') throw new HttpError(400, 'There is nothing to try again: this image has no stored prompt.');
  return block;
}

/**
 * Try again: re-runs a failed image's generation into the same block, replaying the recipe that made it (its origin):
 * a Regenerate block goes through fillRegenerated (writing its prompt first if that step failed), a More like this
 * variant regenerates from its description, and anything else (the agent's images) regenerates from its stored
 * prompt and aspect ratio with its origin sources, where they still exist, as reference images.
 * Precondition: none.
 * Postcondition: the block went back to `generating` (placeholder event) and then became `ready` with its image, or `error` again with the error rethrown. No other block is created or changed. Throws like loadRetryable before touching anything.
 */
export async function retry(run: ImageActionRun, blockId: string): Promise<void> {
  const failed = loadRetryable(run.deps, blockId);
  const block = run.deps.repo.setBlockStatus(failed.id, 'generating');
  run.emit({ type: 'block', block, isPlaceholder: true });
  const sourceIds = block.origin?.sourceBlockIds ?? [];
  if (block.origin?.action === 'regenerate') return fillRegenerated(run, block, findImageSource(run.deps, sourceIds[0]));
  if (block.origin?.action === 'more-like-this') return generateVariant(run, block, block.prompt!, block.aspectRatio ?? '1:1');
  return replayPrompt(run, block, sourceIds);
}

/**
 * Regenerates an agent-made image from what its block records.
 * Precondition: `block` is `generating` and has a prompt.
 * Postcondition: on success the block holds the new image, is `ready`, a final `block` event was emitted and captioning was requested. On failure it is `error` and the error is rethrown.
 */
async function replayPrompt(run: ImageActionRun, block: Block, sourceIds: string[]): Promise<void> {
  const { repo, llm, config, onImageAdded } = run.deps;
  try {
    const referenceImages = sourceIds.flatMap((id) => findImageSource(run.deps, id)?.dataUrl ?? []);
    const image = await llm.generateImage({
      model: repo.getSettings().models.image, prompt: block.prompt!, aspectRatio: nearestRatio(block.aspectRatio ?? '1:1', config.imageSupportedRatios),
      referenceImages, signal: run.signal,
    });
    const resource = repo.addResource({ blockId: block.id, kind: 'image', mimeType: image.mimeType, bytes: image.bytes });
    run.emit({ type: 'block', block: repo.setBlockStatus(block.id, 'ready'), isPlaceholder: false });
    onImageAdded(resource.id);
  } catch (err) {
    failBlock(run, block.id);
    throw err;
  }
}
