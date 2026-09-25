import { splitBlockRefs } from '@mixboard/shared';

/**
 * Rewrites `[[id:..|name:..]]` references as Markdown links with a `block:` scheme so the Markdown renderer can turn them into chips.
 * Precondition: none.
 * Postcondition: returns text where each reference is `[name](block:id)` (square brackets removed from names); other text is untouched.
 */
export function refsToLinks(text: string): string {
  return splitBlockRefs(text)
    .map((s) => (s.type === 'text' ? s.text : `[${s.name.replace(/[[\]]/g, '')}](block:${s.id})`))
    .join('');
}
