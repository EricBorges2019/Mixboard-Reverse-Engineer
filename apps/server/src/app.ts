import type { AgentDeps } from './agent/loop';
import { registerAgentRoute } from './routes/agent';
import { Hono } from 'hono';
import type { Config } from './config';
import { handleError } from './errors';
import type { Repo } from './repo';
import { registerBlockRoutes } from './routes/blocks';
import { registerImageActionRoutes } from './routes/imageActions';
import { registerMiscRoutes } from './routes/misc';
import { registerProjectRoutes } from './routes/projects';

export interface AppDeps {
  agent?: AgentDeps;
  repo: Repo;
  config: Config;
  onImageAdded: (resourceId: string) => void;
}

/**
 * Builds the HTTP application.
 * Precondition: `deps.repo` is ready.
 * Postcondition: returns a Hono app with all REST routes and JSON error handling mounted.
 */
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.onError(handleError);
  registerProjectRoutes(app, deps);
  registerBlockRoutes(app, deps);
  registerMiscRoutes(app, deps);
  if (deps.agent) {
    registerAgentRoute(app, deps.agent);
    registerImageActionRoutes(app, deps.agent);
  }
  return app;
}
