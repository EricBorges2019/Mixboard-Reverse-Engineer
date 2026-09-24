import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { AspectRatio, type Settings } from '@mixboard/shared';

export interface Config {
  port: number;
  dataDir: string;
  apiKey: string | null;
  baseUrl: string;
  defaults: Settings;
  maxAgentSteps: number;
  imageSupportedRatios: AspectRatio[];
}

/**
 * Builds the server configuration from environment variables.
 * Precondition: `env` values, when set, are valid (ratios are members of AspectRatio, numbers parse).
 * Postcondition: returns a fully populated Config; unset variables take the documented defaults.
 * Throws a ZodError when IMAGE_SUPPORTED_RATIOS contains an unknown ratio.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const agent = env.AGENT_MODEL ?? 'google/gemini-3-flash-preview';
  return {
    port: Number(env.PORT ?? 8787),
    dataDir: resolve(env.DATA_DIR ?? fileURLToPath(new URL('../../../data', import.meta.url))),
    apiKey: env.OPENROUTER_API_KEY || null,
    baseUrl: env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    defaults: {
      puns: false,
      models: {
        agent,
        caption: env.CAPTION_MODEL ?? agent,
        tagline: env.TAGLINE_MODEL ?? agent,
        image: env.IMAGE_MODEL ?? 'google/gemini-3.1-flash-image',
      },
    },
    maxAgentSteps: Number(env.MAX_AGENT_STEPS ?? 12),
    imageSupportedRatios: (env.IMAGE_SUPPORTED_RATIOS ?? '1:1,4:3,3:4,16:9,9:16')
      .split(',')
      .map((s) => AspectRatio.parse(s.trim())),
  };
}
