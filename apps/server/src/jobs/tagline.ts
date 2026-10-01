import { readPrompt } from '../agent/prompts';
import type { Llm } from '../llm/types';

/**
 * Asks a fast model for one punny loading tagline about the user's request (D2).
 * Precondition: `model` is a text model id.
 * Postcondition: returns the first line of the reply with surrounding quotes removed, capped at 120 characters; returns null when the reply is empty, the call fails, or `signal` aborts. Never throws.
 */
export async function generateTagline(input: { llm: Llm; model: string; message: string; signal?: AbortSignal }): Promise<string | null> {
  try {
    const { message } = await input.llm.chat({
      model: input.model,
      messages: [
        { role: 'system', content: readPrompt('tagline.md') },
        { role: 'user', content: input.message },
      ],
      signal: input.signal,
    });
    const text = typeof message.content === 'string' ? message.content : '';
    const line = text.trim().split('\n')[0]?.trim().replace(/^["“”']+|["“”']+$/g, '') ?? '';
    return line ? line.slice(0, 120) : null;
  } catch {
    return null;
  }
}
