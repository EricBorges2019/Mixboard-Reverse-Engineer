import { describe, it, expect } from 'vitest';
import { readPngSize } from '../src/llm/imageSize';

describe('readPngSize', () => {
  it('reads width and height from a PNG header', () => {
    const b = Buffer.alloc(24);
    b.writeUInt32BE(0x89504e47, 0);
    b.writeUInt32BE(640, 16);
    b.writeUInt32BE(360, 20);
    expect(readPngSize(b)).toEqual({ w: 640, h: 360 });
  });
  it('returns null for other data', () => {
    expect(readPngSize(Buffer.from('nope'))).toBeNull();
  });
});
