import { LlmError, NoImageError, type ChatMessage, type ChatRequest, type ChatResult, type GeneratedImage, type ImageRequest, type Llm } from './types';

export interface OpenRouterOptions {
  apiKey: string | null;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

/**
 * Keeps only the fields OpenRouter accepts back in a conversation.
 * Precondition: `raw` is an assistant message object from a chat-completions response.
 * Postcondition: returns role, content, tool_calls and reasoning_details (unmodified) when present; drops everything else (e.g. `images`).
 */
function normalizeMessage(raw: any): ChatMessage {
  const m: ChatMessage = { role: 'assistant', content: raw.content ?? null };
  if (raw.tool_calls?.length) m.tool_calls = raw.tool_calls;
  if (raw.reasoning_details !== undefined) m.reasoning_details = raw.reasoning_details;
  return m;
}

/**
 * Decodes a `data:` URL, or downloads an http(s) URL.
 * Precondition: `url` is a data URL or an http(s) URL.
 * Postcondition: returns the bytes and mime type; throws LlmError when the URL cannot be read.
 */
async function decodeImageUrl(url: string, fetchImpl: typeof fetch): Promise<GeneratedImage> {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (m) return { bytes: Buffer.from(m[2], 'base64'), mimeType: m[1] };
  if (!/^https?:\/\//.test(url)) throw new LlmError('Unsupported image URL in model response');
  const res = await fetchImpl(url);
  if (!res.ok) throw new LlmError(`Could not download generated image (${res.status})`, res.status);
  return { bytes: Buffer.from(await res.arrayBuffer()), mimeType: res.headers.get('content-type') ?? 'image/png' };
}

export class OpenRouterLlm implements Llm {
  /**
   * Creates a client.
   * Precondition: `opts.baseUrl` is the OpenRouter API root without a trailing slash.
   * Postcondition: no network activity happens until a method is called.
   */
  constructor(private readonly opts: OpenRouterOptions) {}

  /**
   * POSTs to /chat/completions and returns the parsed JSON.
   * Precondition: an API key is configured.
   * Postcondition: returns the response body; throws LlmError (with HTTP status when known) on a missing key, non-2xx, or an error object in the body.
   */
  private async post(body: unknown, signal?: AbortSignal): Promise<any> {
    if (!this.opts.apiKey) throw new LlmError('OPENROUTER_API_KEY is not set. Add it to .env and restart the server.');
    const res = await (this.opts.fetchImpl ?? fetch)(`${this.opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.opts.apiKey}`, 'content-type': 'application/json', 'x-title': 'Mixboard Clone' },
      body: JSON.stringify(body),
      signal,
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { /* non-JSON error body handled below */ }
    if (!res.ok || json?.error) throw new LlmError(json?.error?.message ?? `OpenRouter returned ${res.status}`, res.status);
    return json;
  }

  /**
   * Runs one non-streaming chat completion.
   * Precondition: `req.model` is a valid OpenRouter model id; `req.messages` is a valid conversation.
   * Postcondition: returns the assistant message (normalized) and finish reason; throws LlmError on failure.
   */
  async chat(req: ChatRequest): Promise<ChatResult> {
    const json = await this.post({ model: req.model, messages: req.messages, ...(req.tools?.length ? { tools: req.tools } : {}) }, req.signal);
    const choice = json?.choices?.[0];
    if (!choice?.message) throw new LlmError('OpenRouter returned no choices');
    return { message: normalizeMessage(choice.message), finishReason: choice.finish_reason ?? 'stop' };
  }

  private imageModalityCache: Map<string, string[]> | null = null;

  /**
   * Looks up which output modalities an image model supports, because image-only models
   * (e.g. `openai/gpt-image-*`) reject `["image","text"]` while Gemini image models need it.
   * Precondition: none; the public `/models` endpoint needs no key.
   * Postcondition: returns the model's `output_modalities`, or `["image","text"]` when the model is not listed or the lookup fails. The list is fetched once and cached.
   */
  private async imageModalities(model: string): Promise<string[]> {
    if (!this.imageModalityCache) {
      const cache = new Map<string, string[]>();
      try {
        const res = await (this.opts.fetchImpl ?? fetch)(`${this.opts.baseUrl}/models?output_modalities=image`);
        const json = (await res.json()) as { data?: { id: string; architecture?: { output_modalities?: string[] } }[] };
        for (const m of json.data ?? []) if (m.architecture?.output_modalities?.length) cache.set(m.id, m.architecture.output_modalities);
      } catch { /* offline or unreadable: fall back to the default below, and retry next call */ this.imageModalityCache = null; return ['image', 'text']; }
      this.imageModalityCache = cache;
    }
    return this.imageModalityCache.get(model) ?? ['image', 'text'];
  }

  /**
   * Generates one image.
   * Precondition: `req.model` supports image output; `referenceImages` are data URLs.
   * Postcondition: returns the decoded image; throws NoImageError (including any model text) when none came back, LlmError otherwise.
   */
  async generateImage(req: ImageRequest): Promise<GeneratedImage> {
    const content = [
      { type: 'text', text: req.prompt },
      ...(req.referenceImages ?? []).map((url) => ({ type: 'image_url', image_url: { url } })),
    ];
    const json = await this.post({
      model: req.model,
      messages: [{ role: 'user', content }],
      modalities: await this.imageModalities(req.model),
      image_config: { aspect_ratio: req.aspectRatio },
    }, req.signal);
    const message = json?.choices?.[0]?.message;
    const url = message?.images?.[0]?.image_url?.url;
    if (!url) throw new NoImageError(`The image model returned no image.${message?.content ? ` It said: ${message.content}` : ''}`);
    return decodeImageUrl(url, this.opts.fetchImpl ?? fetch);
  }
}
