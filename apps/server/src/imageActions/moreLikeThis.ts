import { nearestRatioForSize, type AspectRatio, type Block } from '@mixboard/shared';
import { askAboutImage, failBlock, loadImageSource, type ImageActionRun } from './source';

/** The variants' row sits this far below the source. Our choice: Mixboard's placement is unexplained (SPEC §9). */
const GAP_BELOW = 40;
/** Gap between variants in the row, as in Mixboard (SPEC §4.6). */
const GAP_BETWEEN = 20;

/**
 * Parses the More like this reply: `SHORT_LABEL`, the title, then `VARIANT_1..3` each followed by a description, then `END_VARIANTS`.
 * Precondition: none.
 * Postcondition: returns the trimmed title and three trimmed descriptions (which may span paragraphs); tolerates code fences, CRLF and a missing `END_VARIANTS`. Throws when the title or any description is missing or empty.
 */
export function parseVariants(text: string): { title: string; descriptions: string[] } {
  const body = text.replace(/\r\n/g, '\n').trim().replace(/^```\w*\n?|\n?```$/g, '').trim();
  const m = /SHORT_LABEL[ \t]*\n([^\n]*)\n\s*VARIANT_1[ \t]*\n([\s\S]*?)\n\s*VARIANT_2[ \t]*\n([\s\S]*?)\n\s*VARIANT_3[ \t]*\n([\s\S]*?)(?:\n\s*END_VARIANTS[\s\S]*)?$/.exec(body);
  const [title, ...descriptions] = m ? m.slice(1).map((s) => s.trim()) : [];
  if (!title || descriptions.length !== 3 || descriptions.some((d) => !d)) {
    throw new Error('The reply did not match the SHORT_LABEL / VARIANT_1..3 format.');
  }
  return { title, descriptions };
}

/**
 * More like this: three faithful siblings of the source (same subject, gear, pose and framing; small changes).
 * The vision model writes three differing descriptions; each variant is generated from its own description at
 * the source's aspect ratio, with no reference image.
 * Precondition: `blockId` is an image block with a stored image.
 * Postcondition: three blocks named `<Title> Variant 1..3` exist in a row below the source, at its size; each finished one holds its image, with its description as both prompt and caption (so no caption job runs). A variant whose image fails is `error` while the others finish, and the call then rejects naming the failures. If the descriptions cannot be written or parsed, no block is created. Throws HttpError 400 when the source is not a usable image.
 */
export async function moreLikeThis(run: ImageActionRun, blockId: string): Promise<void> {
  const { repo, config } = run.deps;
  const source = loadImageSource(run.deps, blockId);
  const { title, descriptions } = parseVariants(await askAboutImage(run, 'more-like-this-prompt.md', source));
  const src = source.block.rect;
  const ratio = nearestRatioForSize(src.w, src.h, config.imageSupportedRatios);
  const blocks = descriptions.map((description, i) => {
    const block = repo.createBlock(source.block.boardId, {
      type: 'image', name: `${title} Variant ${i + 1}`, status: 'generating', prompt: description, aspectRatio: ratio,
      origin: { action: 'more-like-this', sourceBlockIds: [source.block.id] },
      rect: { x: src.x + i * (src.w + GAP_BETWEEN), y: src.y + src.h + GAP_BELOW, w: src.w, h: src.h },
    });
    run.emit({ type: 'block', block, isPlaceholder: true });
    return block;
  });
  const results = await Promise.allSettled(blocks.map((block, i) => generateVariant(run, block, descriptions[i], ratio)));
  const failures = results.flatMap((r) => (r.status === 'rejected' ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : []));
  if (failures.length) throw new Error(`${failures.length} of ${blocks.length} variations failed: ${failures.join('; ')}`);
}

/**
 * Generates one variant into its placeholder. Shared by More like this and Try again.
 * Precondition: `block` is a `generating` image block.
 * Postcondition: on success the block holds the image, its caption is `{title: '', description}` and it is `ready`, with a final `block` event emitted. On failure it is `error` and the error is rethrown.
 */
export async function generateVariant(run: ImageActionRun, block: Block, description: string, ratio: AspectRatio): Promise<void> {
  const { repo, llm } = run.deps;
  try {
    const image = await llm.generateImage({ model: repo.getSettings().models.image, prompt: description, aspectRatio: ratio, referenceImages: [], signal: run.signal });
    const resource = repo.addResource({ blockId: block.id, kind: 'image', mimeType: image.mimeType, bytes: image.bytes });
    repo.setCaption(resource.id, { title: '', description });
    run.emit({ type: 'block', block: repo.setBlockStatus(block.id, 'ready'), isPlaceholder: false });
  } catch (err) {
    failBlock(run, block.id);
    throw err;
  }
}
