import type { Hono } from 'hono';
import { z } from 'zod';
import { Viewport } from '@mixboard/shared';
import type { AppDeps } from '../app';

/**
 * Registers project and board routes.
 * Precondition: `app` is a Hono app; `deps.repo` is ready.
 * Postcondition: the project/board routes from the Task 4 table are mounted on `app`.
 */
export function registerProjectRoutes(app: Hono, { repo }: AppDeps): void {
  app.get('/api/projects', (c) => c.json(repo.listProjects()));
  app.post('/api/projects', async (c) => {
    const { title } = z.object({ title: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
    const project = repo.createProject(title);
    return c.json({ project, board: repo.createBoard(project.id) }, 201);
  });
  app.get('/api/projects/:id', (c) => c.json({ project: repo.getProject(c.req.param('id')), boards: repo.listBoards(c.req.param('id')) }));
  app.patch('/api/projects/:id', async (c) => {
    const { title } = z.object({ title: z.string().min(1) }).parse(await c.req.json());
    return c.json(repo.updateProject(c.req.param('id'), { title }));
  });
  app.post('/api/projects/:id/boards', async (c) => {
    const { title } = z.object({ title: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
    return c.json(repo.createBoard(c.req.param('id'), title), 201);
  });
  app.get('/api/boards/:id', (c) => c.json(repo.getBoard(c.req.param('id'))));
  app.patch('/api/boards/:id', async (c) => {
    const patch = z.object({ title: z.string().optional(), viewport: Viewport.optional() }).parse(await c.req.json());
    return c.json(repo.updateBoard(c.req.param('id'), patch));
  });
  app.get('/api/boards/:id/messages', (c) => {
    const out: { role: 'user' | 'assistant'; text: string }[] = [];
    for (const m of repo.listMessages(c.req.param('id')) as { role: string; content: unknown }[]) {
      if ((m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content) out.push({ role: m.role, text: m.content });
    }
    return c.json(out);
  });
}
