import { describe, it, expect } from 'vitest';
import { statusLabel } from '../src/chat/status';

describe('statusLabel', () => {
  it('uses the fixed labels from the original UI', () => {
    expect(statusLabel('create_image_block')).toBe('Creating image...');
    expect(statusLabel('create_text_block')).toBe('Creating text...');
    expect(statusLabel('load_skill')).toBe('Gearing up...');
    expect(statusLabel('update_image_block')).toBe('Polishing the pixels...');
  });
  it('falls back for unknown tools', () => {
    expect(statusLabel('something_new')).toBe('Working...');
  });
});
