import type { AspectRatio } from '@mixboard/shared';

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning_details?: unknown;
}

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest { model: string; messages: ChatMessage[]; tools?: ToolSpec[]; signal?: AbortSignal }
export interface ChatResult { message: ChatMessage; finishReason: string }
export interface ImageRequest { model: string; prompt: string; aspectRatio: AspectRatio; referenceImages?: string[]; signal?: AbortSignal }
export interface GeneratedImage { bytes: Buffer; mimeType: string }

export interface Llm {
  chat(req: ChatRequest): Promise<ChatResult>;
  generateImage(req: ImageRequest): Promise<GeneratedImage>;
}

export class LlmError extends Error {
  /**
   * Builds a model-call error.
   * Precondition: `status` is the HTTP status when one is known.
   * Postcondition: `name` is LlmError and `status` is kept for callers.
   */
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'LlmError';
  }
}

export class NoImageError extends LlmError {
  /**
   * Builds the error for a model reply that contained no image.
   * Precondition: `message` says what the model returned instead.
   * Postcondition: it is an LlmError whose `name` is NoImageError.
   */
  constructor(message: string) {
    super(message);
    this.name = 'NoImageError';
  }
}
