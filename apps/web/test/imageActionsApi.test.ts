import { afterEach, describe, it, expect, vi } from 'vitest';
import type { AgentEvent } from '@mixboard/shared';
import { runImageAction } from '../src/api/imageActions';
import { ApiError } from '../src/api/client';

/** A fetch Response streaming the given SSE text. */
function sseResponse(text: string, status = 200): Response {
  return new Response(new Blob([text]).stream(), { status, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('runImageAction', () => {
  it('posts to the action route and passes each streamed event on in order', async () => {
    const fetchMock = vi.fn(async () => sseResponse('event: error\ndata: {"type":"error","message":"boom"}\n\nevent: done\ndata: {"type":"done"}\n\n'));
    vi.stubGlobal('fetch', fetchMock);
    const events: AgentEvent[] = [];
    await runImageAction('more-like-this', 'b1', (e) => events.push(e));
    expect(fetchMock).toHaveBeenCalledWith('/api/blocks/b1/more-like-this', expect.objectContaining({ method: 'POST' }));
    expect(events).toEqual([{ type: 'error', message: 'boom' }, { type: 'done' }]);
  });
  it('rejects with ApiError when the route refuses the block', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'This action needs an image block that has an image.' }), { status: 400 })));
    await expect(runImageAction('regenerate', 'b1', () => {})).rejects.toBeInstanceOf(ApiError);
  });
});
