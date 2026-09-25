import { describe, it, expect } from 'vitest';
import { refsToLinks } from '../src/chat/refs';

describe('refsToLinks', () => {
  it('turns block references into markdown links with a block: scheme', () => {
    expect(refsToLinks('Made [[id:abc|name:Dragon Elder]] for you.')).toBe('Made [Dragon Elder](block:abc) for you.');
  });
  it('strips brackets from names so the link stays valid and leaves other text alone', () => {
    expect(refsToLinks('[[id:1|name:A [x] B]]')).toBe('[A x B](block:1)');
    expect(refsToLinks('no refs [here](https://e.com)')).toBe('no refs [here](https://e.com)');
  });
});

describe('refsToLinks edge cases', () => {
  it('handles a name ending in a bracket and does not swallow a following ref', () => {
    expect(refsToLinks('[[id:1|name:A [x]]]')).toBe('[A x](block:1)');
    expect(refsToLinks('[[id:a|name:foo] typo, see [[id:b|name:Bar]]')).toContain('[Bar](block:b)');
  });
});
