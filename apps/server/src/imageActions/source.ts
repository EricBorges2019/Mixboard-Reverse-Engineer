import type { AgentEvent, Block } from '@mixboard/shared';
import type { AgentDeps } from '../agent/loop';
import { readPrompt } from '../agent/prompts';
import { HttpError } from '../errors';

/**
 * Shared plumbing for the Regenerate and More like this buttons (SPEC §4.6). Like Mixboard, these bypass the
 * agent: a vision model reads the source image with one of our reconstructed prompts (the originals run on
 * Mixboard's server and were never captured), then the image model generates new blocks. The source block is
 * never changed.
 */

/** What an image action needs: the agent's dependencies without its skill registry. */
export type ImageActionDeps = Pick<AgentDeps, 'repo' | 'llm' | 'config' | 'onImageAdded'>;

/** One run of an image action: its dependencies, where its events go, and what cancels it. */
export interface ImageActionRun {
  deps: ImageActionDeps;
  emit(e: AgentEvent): void;
  signal: AbortSignal;
}

/** The source block and its image as a data URL for the vision model. */
export interface ImageSource {
  block: Block;
  dataUrl: string;
}

/**
 * Loads the image an action starts from.
 * Precondition: none.
 * Postcondition: returns the block and its image; throws NotFoundError for an unknown id, and HttpError 400 for a text block or an image block without a stored file.
 */
export function loadImageSource(deps: ImageActionDeps, blockId: string): ImageSource {
  const block = deps.repo.getBlock(blockId);
  const resource = block.type === 'image' ? block.resources.find((r) => r.kind === 'image') : undefined;
  const file = resource && deps.repo.readResourceBytes(resource.id);
  if (!file) throw new HttpError(400, 'This action needs an image block that has an image.');
  return { block, dataUrl: `data:${file.mimeType};base64,${file.bytes.toString('base64')}` };
}

/**
 * Loads a block's source image when it still exists.
 * Precondition: none.
 * Postcondition: returns the source like loadImageSource, or null when the block was deleted or no longer has an image.
 */
export function findImageSource(deps: ImageActionDeps, blockId: string): ImageSource | null {
  try {
    return loadImageSource(deps, blockId);
  } catch {
    return null;
  }
}

/**
 * Asks the vision (caption) model about the source image.
 * Precondition: `promptFile` exists under `prompts/`.
 * Postcondition: returns the model's reply with CRLF normalised, surrounding code fences removed and whitespace trimmed (possibly empty). Rejects on a model error or abort.
 */
export async function askAboutImage(run: ImageActionRun, promptFile: string, source: ImageSource): Promise<string> {
  const { message } = await run.deps.llm.chat({
    model: run.deps.repo.getSettings().models.caption,
    messages: [
      { role: 'user', content: [
        { type: 'text', text: readPrompt(promptFile) },
        { type: 'image_url', image_url: { url: source.dataUrl } },
      ] },
    ],
    signal: run.signal,
  });
  const text = typeof message.content === 'string' ? message.content : '';
  return text.replace(/\r\n/g, '\n').trim().replace(/^```\w*\n?|\n?```$/g, '').trim();
}

/**
 * Marks a new block as failed.
 * Precondition: the block exists.
 * Postcondition: the block's status is `error` and a final `block` event was emitted.
 */
export function failBlock(run: ImageActionRun, blockId: string): void {
  run.emit({ type: 'block', block: run.deps.repo.setBlockStatus(blockId, 'error'), isPlaceholder: false });
}
