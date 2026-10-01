import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { buildSkills } from './agent/skills/definitions';
import { SkillRegistry } from './agent/skills/registry';
import { createApp } from './app';
import { loadConfig } from './config';
import { openDb } from './db';
import { createCaptionJob } from './jobs/caption';
import { OpenRouterLlm } from './llm/openrouter';
import { Repo } from './repo';

try { process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); } catch { /* .env is optional */ }

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const repo = new Repo(openDb(join(config.dataDir, 'mixboard.sqlite')), join(config.dataDir, 'files'), config.defaults);
const llm = new OpenRouterLlm({ apiKey: config.apiKey, baseUrl: config.baseUrl });
const captionJob = createCaptionJob({
  repo,
  llm,
  /**
   * Reads the caption model id at call time so a settings change applies to the next job.
   * Precondition: none.
   * Postcondition: returns the currently configured caption model id.
   */
  getModel: () => repo.getSettings().models.caption,
});

/**
 * Starts background captioning for a new image resource.
 * Precondition: `resourceId` names a stored image resource.
 * Postcondition: returns immediately; the caption appears later (or not, if all attempts fail).
 */
function onImageAdded(resourceId: string): void {
  void captionJob.enqueue(resourceId);
}

const app = createApp({ repo, config, onImageAdded, agent: { repo, llm, registry: new SkillRegistry(buildSkills()), config, onImageAdded } });
serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Mixboard server on http://localhost:${info.port}${config.apiKey ? '' : ' (OPENROUTER_API_KEY is not set: the agent will fail until you add it to .env)'}`);
});
