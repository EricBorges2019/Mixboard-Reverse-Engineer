import { describe, it, expect } from 'vitest';
import { parseSse } from '../src/api/sse';

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); } });
}
async function collect(s: ReadableStream<Uint8Array>) {
  const out: { event: string; data: string }[] = [];
  for await (const e of parseSse(s)) out.push(e);
  return out;
}

describe('parseSse', () => {
  it('yields several events from one chunk', async () => {
    expect(await collect(stream(['event: a\ndata: 1\n\nevent: b\ndata: 2\n\n']))).toEqual([{ event: 'a', data: '1' }, { event: 'b', data: '2' }]);
  });
  it('reassembles events split across chunks, including inside a line', async () => {
    expect(await collect(stream(['event: te', 'xt\nda', 'ta: {"x":1}\n', '\n']))).toEqual([{ event: 'text', data: '{"x":1}' }]);
  });
  it('handles CRLF, comments and multi-line data', async () => {
    expect(await collect(stream([': keepalive\r\n\r\nevent: m\r\ndata: a\r\ndata: b\r\n\r\n']))).toEqual([{ event: 'm', data: 'a\nb' }]);
  });
  it('defaults the event name and drops an unterminated trailing event', async () => {
    expect(await collect(stream(['data: x\n\ndata: unfinished']))).toEqual([{ event: 'message', data: 'x' }]);
  });
});

describe('parseSse cancellation', () => {
  it('cancels the body when the consumer stops early', async () => {
    let cancelled = false;
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(enc.encode('event: a\ndata: 1\n\n')); },
      cancel() { cancelled = true; },
    });
    for await (const _e of parseSse(body)) break;
    expect(cancelled).toBe(true);
  });
});
