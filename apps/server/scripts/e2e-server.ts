import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { buildSkills } from '../src/agent/skills/definitions';
import { SkillRegistry } from '../src/agent/skills/registry';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { openDb } from '../src/db';
import { createCaptionJob } from '../src/jobs/caption';
import { OpenRouterLlm } from '../src/llm/openrouter';
import { Repo } from '../src/repo';
import { chatReply, startFakeOpenRouter } from '../test/fakeOpenRouter';

/** Agent replies in order: unlock text skill, create a note, answer. Caption calls get a fixed caption. */
let agentCalls = 0;
const fake = await startFakeOpenRouter((body) => {
  if (body.model === 'test/caption') return chatReply({ content: 'LONG_DESCRIPTION\nA test description.\nSHORT_LABEL\nTest Caption\nEND_LABELS' });
  agentCalls++;
  if (agentCalls === 1) return chatReply({ tool_calls: [{ name: 'load_skill', args: { skill_name: 'text-generation-skill' } }] });
  if (agentCalls === 2) return chatReply({ tool_calls: [{ name: 'create_text_block', args: { generated_text_content: 'Oil painting notes', name: 'Notes', x: 100, y: 100 } }] });
  return chatReply({ content: 'Added a note. Want an image next?' });
});

const dir = mkdtempSync(join(tmpdir(), 'mb-e2e-'));
const config = loadConfig({
  OPENROUTER_API_KEY: 'test', OPENROUTER_BASE_URL: fake.url, PORT: '8788', DATA_DIR: dir,
  AGENT_MODEL: 'test/agent', CAPTION_MODEL: 'test/caption', TAGLINE_MODEL: 'test/tagline', IMAGE_MODEL: 'test/image',
});
const repo = new Repo(openDb(':memory:'), join(dir, 'files'), config.defaults);
const llm = new OpenRouterLlm({ apiKey: config.apiKey, baseUrl: config.baseUrl });
const captionJob = createCaptionJob({
  repo,
  llm,
  /**
   * Reads the caption model id at call time.
   * Precondition: none.
   * Postcondition: returns the currently configured caption model id.
   */
  getModel: () => repo.getSettings().models.caption,
});

/**
 * Starts captioning for a new image (same wiring as main.ts).
 * Precondition: `id` is a stored image resource id.
 * Postcondition: returns immediately; the caption arrives later.
 */
function onImageAdded(id: string): void {
  void captionJob.enqueue(id);
}
const app = createApp({ repo, config, onImageAdded, agent: { repo, llm, registry: new SkillRegistry(buildSkills()), config, onImageAdded } });
serve({ fetch: app.fetch, port: config.port }, () => console.log('e2e server on 8788'));
