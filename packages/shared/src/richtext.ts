export interface RichTextDoc {
  type: 'doc';
  content?: unknown[];
}

/**
 * Converts plain text into a ProseMirror/TipTap document, one paragraph per line.
 * Precondition: none (empty string is allowed).
 * Postcondition: returns a `doc` with one paragraph per `\n`-separated line; blank lines become empty paragraphs.
 */
export function plainTextToDoc(text: string): RichTextDoc {
  const content = text.split('\n').map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' }));
  return { type: 'doc', content };
}

/**
 * Wraps a document in the format Mixboard stores for text blocks.
 * Precondition: `doc` is a `doc` node.
 * Postcondition: returns `{richText, scale: 1, autoSize: false}`.
 */
export function wrapTextContent(doc: RichTextDoc): { richText: RichTextDoc; scale: number; autoSize: boolean } {
  return { richText: doc, scale: 1, autoSize: false };
}

/**
 * Reads either the bare `{type:"doc"}` form or the wrapped `{richText}` form.
 * Precondition: none; `content` may be any value.
 * Postcondition: returns the doc, or null when `content` holds none.
 */
export function unwrapTextContent(content: unknown): RichTextDoc | null {
  if (typeof content !== 'object' || content === null) return null;
  const c = content as { type?: unknown; richText?: { type?: unknown } };
  if (c.type === 'doc') return content as RichTextDoc;
  if (c.richText && typeof c.richText === 'object' && c.richText.type === 'doc') return c.richText as RichTextDoc;
  return null;
}

/**
 * Collects the text of a node tree.
 * Precondition: `node` is any JSON value.
 * Postcondition: returns the concatenated text of descendant text nodes.
 */
function collect(node: unknown): string {
  const n = node as { text?: unknown; content?: unknown[] } | null;
  if (typeof n?.text === 'string') return n.text;
  return (n?.content ?? []).map(collect).join('');
}

/**
 * Extracts plain text from bare or wrapped text-block content.
 * Precondition: none.
 * Postcondition: returns paragraphs joined by `\n`; empty string when there is no doc.
 */
export function docToPlainText(content: unknown): string {
  const doc = unwrapTextContent(content);
  return doc ? (doc.content ?? []).map(collect).join('\n') : '';
}
