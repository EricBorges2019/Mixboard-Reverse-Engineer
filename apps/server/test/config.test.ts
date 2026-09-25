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
  });
  it('applies overrides', () => {
    const c = loadConfig({ AGENT_MODEL: 'a/b', CAPTION_MODEL: 'c/d', IMAGE_SUPPORTED_RATIOS: '1:1,16:9', OPENROUTER_API_KEY: 'k' });
    expect(c.defaults.models).toMatchObject({ agent: 'a/b', caption: 'c/d', tagline: 'a/b' });
    expect(c.imageSupportedRatios).toEqual(['1:1', '16:9']);
    expect(c.apiKey).toBe('k');
  });
});
