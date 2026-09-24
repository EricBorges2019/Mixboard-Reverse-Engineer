import { z } from 'zod';
import { NotFoundError } from '../../repo';
import { defineTool, type ToolDef } from '../skills/registry';

export const styleTools: ToolDef[] = [
  defineTool({
    name: 'save_style',
    description: 'Save a reusable style (six Markdown sections) and generate a preview logo for it.',
    schema: z.object({ style_content: z.string().min(1), style_name: z.string().min(1).default('style') }),
    /**
     * Saves a style artifact and, best effort, a preview image.
     * Precondition: arguments are validated.
     * Postcondition: the style exists; the preview is attached when generation succeeds and skipped silently when it fails; returns `Style "<name>" saved successfully.`.
     */
    async run(a, ctx) {
      const style = ctx.repo.saveStyle({ projectId: ctx.projectId, name: a.style_name, content: a.style_content });
      try {
        const image = await ctx.llm.generateImage({
          model: ctx.models.image,
          prompt: `A small square emblem that captures this visual style. No text, no letters.\n\n${a.style_content}`,
          aspectRatio: '1:1',
          signal: ctx.signal,
        });
        ctx.repo.setStylePreview(style.id, image.bytes, image.mimeType);
      } catch (err) {
        if (ctx.signal.aborted) throw err;
      }
      return `Style "${a.style_name}" saved successfully.`;
    },
  }),
  defineTool({
    name: 'get_style',
    description: 'Fetch a saved style by id.',
    schema: z.object({ artifact_id: z.string() }),
    /**
     * Reads a style.
     * Precondition: none.
     * Postcondition: returns `{name, content}`, or `{error}` when the id is unknown.
     */
    async run({ artifact_id }, ctx) {
      try {
        const s = ctx.repo.getStyle(artifact_id);
        return { name: s.name, content: s.content };
      } catch (err) {
        if (err instanceof NotFoundError) return { error: `Style ${artifact_id} not found.` };
        throw err;
      }
    },
  }),
  defineTool({
    name: 'delete_style',
    description: 'Delete a saved style by id.',
    schema: z.object({ artifact_id: z.string() }),
    /**
     * Deletes a style.
     * Precondition: the style exists.
     * Postcondition: the style and preview are gone; throws NotFoundError otherwise.
     */
    async run({ artifact_id }, ctx) {
      ctx.repo.deleteStyle(artifact_id);
      return `Style ${artifact_id} deleted.`;
    },
  }),
];
