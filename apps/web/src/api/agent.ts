import { AgentEvent, type AgentRunRequest } from '@mixboard/shared';
import { ApiError } from './client';
import { parseSse } from './sse';

/**
 * Runs one agent turn and streams its events.
 * Precondition: `req.message` is non-blank; `req.boardId` exists.
 * Postcondition: `onEvent` was called for each validated event in order until the stream ended. Rejects with ApiError on an HTTP error (e.g. 400 blank message). An aborted `signal` rejects with an AbortError.
 */
export async function runAgent(req: AgentRunRequest, onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch('/api/agent/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), signal });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? res.statusText);
  }
  for await (const { data } of parseSse(res.body)) onEvent(AgentEvent.parse(JSON.parse(data)));
}
