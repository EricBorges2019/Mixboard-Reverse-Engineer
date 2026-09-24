export type RefSegment = { type: 'text'; text: string } | { type: 'ref'; id: string; name: string };

/**
 * Formats a block reference that chat renders as a chip.
 * Precondition: `id` and `name` contain no `]` characters.
 * Postcondition: returns `[[id:<id>|name:<name>]]`.
 */
export function blockRef(id: string, name: string): string {
  return `[[id:${id}|name:${name}]]`;
}

/**
 * Splits chat text into plain and reference segments.
 * Precondition: none. Names may contain single `]` but not `]]`.
 * Postcondition: concatenating the segments' text (refs re-formatted) reproduces `text`; empty text segments are omitted.
 */
export function splitBlockRefs(text: string): RefSegment[] {
  const out: RefSegment[] = [];
  const re = /\[\[id:([^|\]]+)\|name:((?:(?!\]\]).)*)\]\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    out.push({ type: 'ref', id: m[1], name: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}
