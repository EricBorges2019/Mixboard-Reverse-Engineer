import type { Hono } from 'hono';
import { z } from 'zod';
import { NewBlock } from '@mixboard/shared';
import type { AppDeps } from '../app';
import { HttpError } from '../errors';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/**
 * Registers block, upload, file and caption routes.
 * Precondition: `app` is a Hono app; `deps` is ready.
 * Postcondition: the block/resource routes from the Task 4 table are mounted on `app`.
 */
export function registerBlockRoutes(app: Hono, { repo, onImageAdded }: AppDeps): void {
  app.post('/api/boards/:id/blocks', async (c) => c.json(repo.createBlock(c.req.param('id'), NewBlock.parse(await c.req.json())), 201));
  app.patch('/api/blocks/:id', async (c) => c.json(repo.patchBlock(c.req.param('id'), await c.req.json())));
  app.patch('/api/blocks/:id/text', async (c) => {
    const { content } = z.object({ content: z.unknown() }).parse(await c.req.json());
    if (repo.getBlock(c.req.param('id')).type !== 'text') throw new HttpError(400, 'Block is not a text block');
    repo.updateTextContent(c.req.param('id'), content);
    return c.json(repo.getBlock(c.req.param('id')));
  });
  app.delete('/api/blocks/:id', (c) => {
    repo.deleteBlock(c.req.param('id'));
    return c.body(null, 204);
  });
  app.put('/api/blocks/:id/image', async (c) => {
    const block = repo.getBlock(c.req.param('id'));
    const mimeType = (c.req.header('content-type') ?? '').split(';')[0].trim();
    if (block.type !== 'image') throw new HttpError(400, 'Block is not an image block');
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) throw new HttpError(415, 'Only image uploads are accepted');
    if (Number(c.req.header('content-length') ?? 0) > MAX_IMAGE_BYTES) throw new HttpError(413, 'Image is larger than 20 MB');
    const bytes = Buffer.from(await c.req.arrayBuffer());
    if (bytes.length === 0) throw new HttpError(400, 'Empty upload');
    if (bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Image is larger than 20 MB');
    repo.clearResources(block.id);
    const resource = repo.addResource({ blockId: block.id, kind: 'image', mimeType, bytes });
    repo.setBlockStatus(block.id, 'ready');
    onImageAdded(resource.id);
    return c.json(repo.getBlock(block.id));
  });
  app.get('/api/files/:resourceId', (c) => {
    const file = repo.readResourceBytes(c.req.param('resourceId'));
    if (!file) return c.json({ error: 'File not found' }, 404);
    return c.body(new Uint8Array(file.bytes), 200, { 'content-type': file.mimeType, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': 'sandbox' });
  });
  app.patch('/api/resources/:id/caption', async (c) => {
    const caption = z.object({ title: z.string(), description: z.string() }).parse(await c.req.json());
    return c.json(repo.setCaption(c.req.param('id'), caption, true));
  });
}
