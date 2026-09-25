import { AgentEvent } from '@mixboard/shared';
import type { ImageAction } from '../canvas/imageActions';
import { ApiError } from './client';
import { parseSse } from './sse';

/**
 * Runs Regenerate or More like this on an image block and streams its events (same format as the agent's).
 * Precondition: `blockId` is an image block with an image.
 * Postcondition: `onEvent` was called for each validated event in order (`block` placeholders and results, an `error` if the action failed, then `done`). Rejects with ApiError when the route refuses the request (400 not an image, 404 unknown block); an aborted `signal` rejects with an AbortError.
 */
export async function runImageAction(action: ImageAction, blockId: string, onEvent: (e: AgentEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`/api/blocks/${encodeURIComponent(blockId)}/${action}`, { method: 'POST', signal });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? res.statusText);
  }
  for await (const { data } of parseSse(res.body)) onEvent(AgentEvent.parse(JSON.parse(data)));
}
