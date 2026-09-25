import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { moreLikeThis } from '../imageActions/moreLikeThis';
import { regenerate } from '../imageActions/regenerate';
import { loadRetryable, retry } from '../imageActions/retry';
import { loadImageSource, type ImageActionDeps, type ImageActionRun } from '../imageActions/source';
import { createSseEmitter } from './agent';

/** URL segment → the check run before streaming (throws 404/400) and the action itself. */
const ACTIONS: Record<string, { check(deps: ImageActionDeps, blockId: string): unknown; run(run: ImageActionRun, blockId: string): Promise<void> }> = {
  regenerate: { check: loadImageSource, run: regenerate },
  'more-like-this': { check: loadImageSource, run: moreLikeThis },
  retry: { check: loadRetryable, run: retry },
};

/**
 * Registers `POST /api/blocks/:id/regenerate`, `/more-like-this` (SPEC §4.6) and `/retry` (Try again on a failed image).
 * Precondition: `deps` are ready.
 * Postcondition: each route checks its block first (404 unknown block; 400 when Regenerate/More like this get no usable image or Try again gets no retryable failed image), then streams the action's `block` events in the agent's SSE format, an `error` event if it failed, and a final `done`. A client disconnect aborts the model calls.
 */
export function registerImageActionRoutes(app: Hono, deps: ImageActionDeps): void {
  for (const [name, { check, run: action }] of Object.entries(ACTIONS)) {
    app.post(`/api/blocks/:id/${name}`, (c) => {
      const blockId = c.req.param('id');
      check(deps, blockId);
      return streamSSE(c, async (stream) => {
        const abort = new AbortController();
        stream.onAbort(() => abort.abort());
        const { emit, flush } = createSseEmitter(stream);
        try {
          await action({ deps, emit, signal: abort.signal }, blockId);
        } catch (err) {
          emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        }
        emit({ type: 'done' });
        await flush();
      });
    });
  }
}
