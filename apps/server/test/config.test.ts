import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('uses defaults', () => {
    const c = loadConfig({});
    expect(c.port).toBe(8787);
    expect(c.apiKey).toBeNull();
    expect(c.defaults.puns).toBe(false);
    expect(c.defaults.models.image).toBe('google/gemini-3.1-flash-image');
    expect(c.defaults.models.caption).toBe(c.defaults.models.agent);
    expect(c.imageSupportedRatios).toEqual(['1:1', '4:3', '3:4', '16:9', '9:16']);
    expect(c.defaults.baseUrl).toBe('https://openrouter.ai/api/v1');
  });
  it('reads the base URL and key from LLM_* first, then OPENROUTER_*', () => {
    expect(loadConfig({ OPENROUTER_BASE_URL: 'http://localhost:11434/v1/' }).defaults.baseUrl).toBe('http://localhost:11434/v1');
    const c = loadConfig({ LLM_BASE_URL: 'https://api.openai.com/v1', OPENROUTER_BASE_URL: 'http://x', LLM_API_KEY: 'a', OPENROUTER_API_KEY: 'b' });
    expect(c.defaults.baseUrl).toBe('https://api.openai.com/v1');
    expect(c.apiKey).toBe('a');
    expect(() => loadConfig({ LLM_BASE_URL: 'api.openai.com' })).toThrow();
  });
  it('applies overrides', () => {
    const c = loadConfig({ AGENT_MODEL: 'a/b', CAPTION_MODEL: 'c/d', IMAGE_SUPPORTED_RATIOS: '1:1,16:9', OPENROUTER_API_KEY: 'k' });
    expect(c.defaults.models).toMatchObject({ agent: 'a/b', caption: 'c/d', tagline: 'a/b' });
    expect(c.imageSupportedRatios).toEqual(['1:1', '16:9']);
    expect(c.apiKey).toBe('k');
  });
});
