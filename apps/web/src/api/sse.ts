/**
 * Parses one raw SSE block (the text between blank lines).
 * Precondition: `raw` has no blank lines and uses `\n` line endings.
 * Postcondition: returns `{event, data}` (event defaults to `message`, multiple `data:` lines join with `\n`), or null when the block has no data.
 */
function parseBlock(raw: string): { event: string; data: string } | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  return data.length ? { event, data: data.join('\n') } : null;
}

/**
 * Reads a Server-Sent Events body incrementally.
 * Precondition: `body` is a readable byte stream of SSE text.
 * Postcondition: yields each complete event in order as chunks arrive; an unterminated trailing event is dropped. Handles events split across chunks and CRLF line endings.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const parsed = parseBlock(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      if (parsed) yield parsed;
    }
  }
}
