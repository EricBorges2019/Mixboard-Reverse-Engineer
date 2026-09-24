import { readPrompt } from '../agent/prompts';
import type { Llm } from '../llm/types';
import type { Repo } from '../repo';

/**
 * Parses the caption model's reply, which follows the recovered prompt's format: `LONG_DESCRIPTION`, the description, `SHORT_LABEL`, the title, `END_LABELS`.
 * Precondition: none.
 * Postcondition: returns the trimmed `{title, description}`; tolerates code fences, CRLF and a missing `END_LABELS`. Throws when either part is missing or empty.
 */
export function parseCaption(text: string): { title: string; description: string } {
  const body = text.replace(/\r\n/g, '\n').replace(/^```\w*\n?|\n?```$/g, '').trim();
  const m = /LONG_DESCRIPTION\s*\n([\s\S]*?)\n\s*SHORT_LABEL[ \t]*\n([^\n]*)/.exec(body);
  const description = m?.[1].trim();
  const title = m?.[2].trim().replace(/^END_LABELS$/, '');
  if (!description || !title) throw new Error('Caption reply did not match the LONG_DESCRIPTION / SHORT_LABEL format.');
  return { title, description };
}

export interface CaptionJobDeps {
  repo: Repo;
  llm: Llm;
  getModel: () => string;
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Creates the background job that captions images (the async server-side caption of SPEC §6), using the recovered caption prompt.
 * Precondition: `deps.repo` and `deps.llm` are ready.
 * Postcondition: returns `enqueue(resourceId)`, which captions the image with up to `attempts` tries (default 3, exponential backoff from 500 ms) and resolves once done. It never rejects: after the last failure the caption stays empty and editable. A user-edited caption is never overwritten (Repo.setCaption guard).
 */
export function createCaptionJob(deps: CaptionJobDeps): { enqueue(resourceId: string): Promise<void> } {
  const attempts = deps.attempts ?? 3;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  /**
   * Makes one captioning attempt.
   * Precondition: the resource has a stored image file.
   * Postcondition: the caption is stored; throws on model or parse failure.
   */
  async function attempt(resourceId: string, file: { bytes: Buffer; mimeType: string }): Promise<void> {
    const { message } = await deps.llm.chat({
      model: deps.getModel(),
      messages: [
        { role: 'user', content: [
          { type: 'text', text: readPrompt('caption-prompt.md') },
          { type: 'image_url', image_url: { url: `data:${file.mimeType};base64,${file.bytes.toString('base64')}` } },
        ] },
      ],
    });
    deps.repo.setCaption(resourceId, parseCaption(typeof message.content === 'string' ? message.content : ''));
  }
  return {
    /**
     * Captions one image resource.
     * Precondition: none; unknown resources and resources without files are ignored.
     * Postcondition: resolves after success or after the final failed attempt; never rejects.
     */
    async enqueue(resourceId: string): Promise<void> {
      try {
        const file = deps.repo.readResourceBytes(resourceId);
        if (!file) return;
        for (let i = 0; i < attempts; i++) {
          try {
            await attempt(resourceId, file);
            return;
          } catch (err) {
            if (i === attempts - 1) console.warn(`Caption failed for ${resourceId}:`, err instanceof Error ? err.message : err);
            else await sleep(500 * 2 ** i);
          }
        }
      } catch (err) {
        console.warn(`Caption job error for ${resourceId}:`, err instanceof Error ? err.message : err);
      }
    },
  };
}
