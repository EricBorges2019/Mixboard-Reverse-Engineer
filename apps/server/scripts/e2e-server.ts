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
import { chatReply, imageReply, startFakeOpenRouter, type FakeReply } from '../test/fakeOpenRouter';

/** A 1x1 transparent PNG, so the browser can actually render generated images. */
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/**
 * The scripted agent turn: unlock the text skill, create a note, answer.
 * Precondition: none.
 * Postcondition: returns the replies to the turn's model calls, in order.
 */
function noteTurn(): FakeReply[] {
  return [
    chatReply({ tool_calls: [{ name: 'load_skill', args: { skill_name: 'text-generation-skill' } }] }),
    chatReply({ tool_calls: [{ name: 'create_text_block', args: { generated_text_content: 'Oil painting notes', name: 'Notes', x: 100, y: 100 } }] }),
    chatReply({ content: 'Added a note. Want an image next?' }),
  ];
}

/**
 * Answers one agent model call. The step is how many assistant messages follow the latest user message, so
 * each turn starts over and the e2e tests can run in any order against one server.
 * Precondition: `body` is a chat-completions request with at least one user message.
 * Postcondition: returns that step of noteTurn, or a final text reply once the script runs out.
 */
function agentReply(body: { messages: { role: string }[] }): FakeReply {
  const lastUser = body.messages.findLastIndex((m) => m.role === 'user');
  const step = body.messages.slice(lastUser + 1).filter((m) => m.role === 'assistant').length;
  return noteTurn()[step] ?? chatReply({ content: 'Done.' });
}

/**
 * Answers the caption model, which also serves the image buttons' vision prompts (told apart by their wording).
 * Precondition: `body` is a chat-completions request.
 * Postcondition: returns three variant descriptions for More like this, one new prompt for Regenerate, else a caption.
 */
function visionReply(body: unknown): FakeReply {
  const request = JSON.stringify(body);
  if (request.includes('Write three descriptions of this image')) {
    return chatReply({ content: 'SHORT_LABEL\nEarth From Space\nVARIANT_1\nThe Earth at dawn.\nVARIANT_2\nThe Earth at dusk.\nVARIANT_3\nThe Earth at noon.\nEND_VARIANTS' });
  }
  if (request.includes('write a prompt for a new, different image')) return chatReply({ content: 'A red desert planet with two small moons.' });
  return chatReply({ content: 'LONG_DESCRIPTION\nA test description.\nSHORT_LABEL\nTest Caption\nEND_LABELS' });
}

const fake = await startFakeOpenRouter((body) => {
  if (body.model === 'test/caption') return visionReply(body);
  if (body.model === 'test/image') return imageReply(TINY_PNG);
  return agentReply(body);
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
