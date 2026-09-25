import { nearestRatio, type Block, type Rect } from '@mixboard/shared';
import { readPngSize } from '../llm/imageSize';
import { askAboutImage, failBlock, loadImageSource, type ImageActionRun, type ImageSource } from './source';

/** Mixboard drops the new block at source + (40, 40), on top of the source (SPEC §4.6). */
const OFFSET = 40;

/**
 * Regenerate: a loose reinterpretation of the source (same concept, genre and medium; new character, gear,
 * pose, setting, lighting and palette). The vision model writes a fresh prompt, and the image is generated
 * from that text alone, as a square with no reference image, so the model cannot just copy the source.
 * Precondition: `blockId` is an image block with a stored image.
 * Postcondition: one new block exists at source + (40, 40), unnamed, with origin `regenerate` from the source; see fillRegenerated for the rest. Its size follows D4: the source's size when `cropRegenerated`, otherwise a landscape placeholder that fillRegenerated reshapes. Throws HttpError 400 before creating anything when the source is not a usable image.
 */
export async function regenerate(run: ImageActionRun, blockId: string): Promise<void> {
  const { repo } = run.deps;
  const source = loadImageSource(run.deps, blockId);
  const src = source.block.rect;
  const at = { x: src.x + OFFSET, y: src.y + OFFSET };
  // Uncropped, the image's shape is unknown until it arrives, so the placeholder starts landscape (4:3).
  const rect: Rect = repo.getSettings().cropRegenerated ? { ...at, w: src.w, h: src.h } : { ...at, ...fitLongSide(4, 3, longSideOf(src)) };
  const block = repo.createBlock(source.block.boardId, {
    type: 'image', name: '', status: 'generating', rect, aspectRatio: '1:1', origin: { action: 'regenerate', sourceBlockIds: [source.block.id] },
  });
  run.emit({ type: 'block', block, isPlaceholder: true });
  await fillRegenerated(run, block, source);
}

/**
 * Generates a Regenerate block's image, writing its prompt first when it has none yet. Shared by Regenerate and Try again.
 * Precondition: `block` is a `generating` block with origin `regenerate`; `source` is its source image, or null when it no longer exists.
 * Postcondition: on success the block holds its prompt and a square image and is `ready`, a final `block` event was emitted and captioning was requested; with `cropRegenerated` off it was reshaped to the image's proportions with the source's long side (the block's own when the source is gone), keeping its position. On failure the block is `error` and the error is rethrown (a missing prompt with no source fails with "the source image was deleted").
 */
export async function fillRegenerated(run: ImageActionRun, block: Block, source: ImageSource | null): Promise<void> {
  const { repo, llm, config, onImageAdded } = run.deps;
  try {
    let prompt = block.prompt;
    if (!prompt) {
      if (!source) throw new Error('The source image was deleted, so there is nothing to regenerate from.');
      prompt = await askAboutImage(run, 'regenerate-prompt.md', source);
      if (!prompt) throw new Error('The model wrote an empty prompt.');
      repo.setBlockPrompt(block.id, prompt);
    }
    const image = await llm.generateImage({
      model: repo.getSettings().models.image, prompt, aspectRatio: nearestRatio('1:1', config.imageSupportedRatios), referenceImages: [], signal: run.signal,
    });
    const resource = repo.addResource({ blockId: block.id, kind: 'image', mimeType: image.mimeType, bytes: image.bytes });
    if (!repo.getSettings().cropRegenerated) {
      const size = readPngSize(image.bytes) ?? { w: 1, h: 1 };
      const longSide = longSideOf(source?.block.rect ?? block.rect);
      repo.patchBlock(block.id, { rect: { x: block.rect.x, y: block.rect.y, ...fitLongSide(size.w, size.h, longSide) } });
    }
    run.emit({ type: 'block', block: repo.setBlockStatus(block.id, 'ready'), isPlaceholder: false });
    onImageAdded(resource.id);
  } catch (err) {
    failBlock(run, block.id);
    throw err;
  }
}

/**
 * The longer side of a rect.
 * Precondition: none.
 * Postcondition: returns max(w, h).
 */
function longSideOf(rect: Rect): number {
  return Math.max(rect.w, rect.h);
}

/**
 * Scales a shape so its longer side has a given length.
 * Precondition: `w`, `h` and `longSide` are positive.
 * Postcondition: returns {w, h} with the same proportions (rounded to whole pixels); a square or wider shape gets `w = longSide`, a taller one `h = longSide`.
 */
function fitLongSide(w: number, h: number, longSide: number): { w: number; h: number } {
  return w >= h ? { w: longSide, h: Math.round((longSide * h) / w) } : { w: Math.round((longSide * w) / h), h: longSide };
}
