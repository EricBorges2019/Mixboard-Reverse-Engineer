import { afterEach, describe, it, expect } from 'vitest';
import { LlmError, NoImageError } from '../src/llm/types';
import { isLocalBaseUrl, OpenRouterLlm } from '../src/llm/openrouter';
import { chatReply, imageReply, startFakeOpenRouter } from './fakeOpenRouter';

let closers: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(closers.map((c) => c())); closers = []; });

async function fake(script: Parameters<typeof startFakeOpenRouter>[0]) {
  const f = await startFakeOpenRouter(script);
  closers.push(f.close);
  return f;
}

describe('OpenRouterLlm.chat', () => {
  it('sends auth, model, messages and tools; returns a normalized message', async () => {
    const f = await fake([chatReply({ content: 'hi' })]);
    const llm = new OpenRouterLlm({ apiKey: 'k', baseUrl: f.url });
    const tools = [{ type: 'function' as const, function: { name: 't', description: 'd', parameters: { type: 'object' } } }];
    const r = await llm.chat({ model: 'm', messages: [{ role: 'user', content: 'yo' }], tools });
    expect(r).toEqual({ message: { role: 'assistant', content: 'hi' }, finishReason: 'stop' });
    expect(f.headers[0].authorization).toBe('Bearer k');
    expect(f.requests[0]).toMatchObject({ model: 'm', tools });
  });
  it('preserves tool calls and reasoning_details', async () => {
    const reply = chatReply({ tool_calls: [{ name: 'x', args: { a: 1 } }] });
    (reply.body as any).choices[0].message.reasoning_details = [{ type: 'r' }];
    const f = await fake([reply]);
    const r = await new OpenRouterLlm({ apiKey: 'k', baseUrl: f.url }).chat({ model: 'm', messages: [] });
    expect(r.message.tool_calls?.[0].function).toEqual({ name: 'x', arguments: '{"a":1}' });
    expect(r.message.reasoning_details).toEqual([{ type: 'r' }]);
    expect(r.finishReason).toBe('tool_calls');
  });
  it('maps HTTP errors to LlmError with the upstream message', async () => {
    const f = await fake([{ status: 429, body: { error: { message: 'slow down' } } }]);
    const err = await new OpenRouterLlm({ apiKey: 'k', baseUrl: f.url }).chat({ model: 'm', messages: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.message).toBe('slow down');
    expect(err.status).toBe(429);
  });
  it('fails fast without an API key on a remote base URL', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return new Response('{}'); };
    await expect(new OpenRouterLlm({ apiKey: null, baseUrl: 'https://api.openai.com/v1', fetchImpl }).chat({ model: 'm', messages: [] })).rejects.toThrow(/OPENROUTER_API_KEY/);
    expect(calls).toBe(0);
  });
  it('calls a local base URL without a key and without an authorization header', async () => {
    const f = await fake([chatReply({ content: 'hi' })]);
    const r = await new OpenRouterLlm({ apiKey: null, baseUrl: f.url }).chat({ model: 'm', messages: [] });
    expect(r.message.content).toBe('hi');
    expect(f.headers[0].authorization).toBeUndefined();
  });
  it('reads a function base URL on every call', async () => {
    const a = await fake([chatReply({ content: 'a' })]);
    const b = await fake([chatReply({ content: 'b' })]);
    let url = a.url;
    const llm = new OpenRouterLlm({ apiKey: 'k', baseUrl: () => url });
    expect((await llm.chat({ model: 'm', messages: [] })).message.content).toBe('a');
    url = b.url;
    expect((await llm.chat({ model: 'm', messages: [] })).message.content).toBe('b');
  });
});

describe('OpenRouterLlm.generateImage', () => {
  it('requests image modality with aspect ratio and reference images; decodes the data URL', async () => {
    const f = await fake([imageReply(Buffer.from([1, 2, 3]), 'image/webp')]);
    const llm = new OpenRouterLlm({ apiKey: 'k', baseUrl: f.url });
    const img = await llm.generateImage({ model: 'img', prompt: 'a cat', aspectRatio: '16:9', referenceImages: ['data:image/png;base64,AAAA'] });
    expect(img.mimeType).toBe('image/webp');
    expect([...img.bytes]).toEqual([1, 2, 3]);
    expect(f.requests[0]).toMatchObject({ model: 'img', modalities: ['image', 'text'], image_config: { aspect_ratio: '16:9' } });
    expect(f.requests[0].messages[0].content).toEqual([
      { type: 'text', text: 'a cat' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ]);
  });
  it('asks image-only models (e.g. GPT Image) for the image modality only', async () => {
    const models = [{ id: 'openai/gpt-image-2.5-flare', architecture: { output_modalities: ['image'] } }];
    const f = await startFakeOpenRouter([imageReply(Buffer.from([1])), imageReply(Buffer.from([2]))], { models });
    closers.push(f.close);
    const llm = new OpenRouterLlm({ apiKey: 'k', baseUrl: f.url });
    await llm.generateImage({ model: 'openai/gpt-image-2.5-flare', prompt: 'p', aspectRatio: '1:1' });
    expect(f.requests[0].modalities).toEqual(['image']);
    await llm.generateImage({ model: 'not/listed', prompt: 'p', aspectRatio: '1:1' });
    expect(f.requests[1].modalities).toEqual(['image', 'text']);
  });
  it('falls back to image+text when the models list cannot be read', async () => {
    const f = await fake([imageReply(Buffer.from([1]))]);
    const llm = new OpenRouterLlm({ apiKey: 'k', baseUrl: f.url, fetchImpl: async (input, init) => (String(input).includes('/models') ? Promise.reject(new Error('offline')) : fetch(input, init)) });
    await llm.generateImage({ model: 'm', prompt: 'p', aspectRatio: '1:1' });
    expect(f.requests[0].modalities).toEqual(['image', 'text']);
  });
  it('throws NoImageError when the model answers with text only', async () => {
    const f = await fake([chatReply({ content: 'I cannot draw that.' })]);
    const err = await new OpenRouterLlm({ apiKey: 'k', baseUrl: f.url }).generateImage({ model: 'img', prompt: 'p', aspectRatio: '1:1' }).catch((e) => e);
    expect(err).toBeInstanceOf(NoImageError);
    expect(err.message).toContain('I cannot draw that.');
  });
});

describe('isLocalBaseUrl', () => {
  it('accepts loopback hosts only', () => {
    for (const u of ['http://localhost:11434/v1', 'http://127.0.0.1:1234/v1', 'http://[::1]:8080/v1']) expect(isLocalBaseUrl(u)).toBe(true);
    for (const u of ['https://openrouter.ai/api/v1', 'https://api.anthropic.com/v1', 'not a url']) expect(isLocalBaseUrl(u)).toBe(false);
  });
});
