import type { Hono } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import { AgentRunRequest, type AgentEvent } from '@mixboard/shared';
import { runAgent, type AgentDeps } from '../agent/loop';

/**
 * Serialises agent events onto an SSE stream in order.
 * Precondition: `stream` is open.
 * Postcondition: returns `emit` (queues a write, never throws) and `flush` (resolves when every queued event was written).
 */
export function createSseEmitter(stream: SSEStreamingApi): { emit: (e: AgentEvent) => void; flush: () => Promise<void> } {
  let queue: Promise<unknown> = Promise.resolve();
  /**
   * Queues one event.
   * Precondition: none.
   * Postcondition: the event is written after all earlier events; write failures (closed stream) are ignored.
   */
  function emit(e: AgentEvent): void {
    queue = queue.then(() => stream.writeSSE({ event: e.type, data: JSON.stringify(e) })).catch(() => undefined);
  }
  /**
   * Waits for queued writes.
   * Precondition: none.
   * Postcondition: resolves after every event queued so far was written or dropped.
   */
  async function flush(): Promise<void> {
    await queue;
  }
  return { emit, flush };
}

/**
 * Registers `POST /api/agent/run`.
 * Precondition: `deps` are ready.
 * Postcondition: the route validates the body (400 on a blank message or bad JSON), checks the board exists (404), then streams events and a final `done`. A client disconnect aborts the run and its in-flight model request.
 */
export function registerAgentRoute(app: Hono, deps: AgentDeps): void {
  app.post('/api/agent/run', async (c) => {
    const req = AgentRunRequest.parse(await c.req.json());
    deps.repo.getBoard(req.boardId);
    return streamSSE(c, async (stream) => {
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      const { emit, flush } = createSseEmitter(stream);
      try {
        await runAgent({ req, deps, emit, signal: abort.signal });
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      }
      emit({ type: 'done' });
      await flush();
    });
  });
}
