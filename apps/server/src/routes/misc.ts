import { readFileSync } from 'node:fs';
import type { Hono } from 'hono';
import { API_KEY_MASK, SettingsPatch } from '@mixboard/shared';
import type { AppDeps } from '../app';

/**
 * Registers style and settings routes.
 * Precondition: `app` is a Hono app; `deps.repo` is ready.
 * Postcondition: the style/settings routes from the Task 4 table are mounted on `app`.
 */
export function registerMiscRoutes(app: Hono, { repo }: AppDeps): void {
  app.get('/api/projects/:id/styles', (c) => c.json(repo.listStyles(c.req.param('id'))));
  app.get('/api/styles/:id/preview', (c) => {
    const f = repo.getStylePreviewFile(c.req.param('id'));
    if (!f) return c.json({ error: 'No preview' }, 404);
    return c.body(new Uint8Array(readFileSync(f.path)), 200, { 'content-type': f.mimeType });
  });
  app.delete('/api/styles/:id', (c) => {
    repo.deleteStyle(c.req.param('id'));
    return c.body(null, 204);
  });
  app.get('/api/settings', (c) => {
    const settings = repo.getSettings();
    return c.json({ ...settings, apiKey: settings.apiKey ? API_KEY_MASK : null });
  });
  app.put('/api/settings', async (c) => {
    const patch = SettingsPatch.parse(await c.req.json());
    if (patch.apiKey === API_KEY_MASK) delete patch.apiKey; // client echoed the mask back unchanged: keep the stored key
    const settings = repo.updateSettings(patch);
    return c.json({ ...settings, apiKey: settings.apiKey ? API_KEY_MASK : null });
  });
}
