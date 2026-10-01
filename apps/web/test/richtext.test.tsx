// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { toRichText } from 'tldraw';
import { unwrapTextContent } from '@mixboard/shared';

describe('tldraw richText format', () => {
  it('is a TipTap doc object (not a JSON string), so it round-trips through our wrapped format', () => {
    const doc = toRichText('Hello');
    expect(typeof doc).toBe('object');
    expect(doc).toMatchObject({ type: 'doc' });
    expect(unwrapTextContent({ richText: doc, scale: 1, autoSize: false })).toEqual(doc);
  });
});
