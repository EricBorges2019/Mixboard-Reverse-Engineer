import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeReply { status?: number; body: unknown; delayMs?: number }
export type FakeScript = FakeReply[] | ((body: any) => FakeReply);

export interface FakeModel { id: string; architecture: { output_modalities: string[] } }

/**
 * Starts an HTTP server that mimics POST /chat/completions with scripted replies and
 * GET /models (used to look up image models' output modalities). Only chat requests are recorded.
 */
export async function startFakeOpenRouter(script: FakeScript, opts: { models?: FakeModel[] } = {}) {
  const requests: any[] = [];
  const headers: IncomingHttpHeaders[] = [];
  let aborted = 0;
  let next = 0;
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url?.startsWith('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: opts.models ?? [] }));
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      requests.push(body);
      headers.push(req.headers);
      const reply = typeof script === 'function' ? script(body) : script[next++];
      if (!reply) {
        res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'fake script exhausted' } }));
        return;
      }
      const timer = setTimeout(() => {
        if (res.destroyed) return;
        res.writeHead(reply.status ?? 200, { 'content-type': 'application/json' }).end(JSON.stringify(reply.body));
      }, reply.delayMs ?? 0);
      res.on('close', () => {
        if (!res.writableFinished) { aborted++; clearTimeout(timer); }
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url, requests, headers,
    aborted: () => aborted,
    close: async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); },
  };
}

/** Builds a chat-completions reply, optionally with tool calls. */
export function chatReply(message: { content?: string | null; tool_calls?: { name: string; args: unknown; id?: string }[] }): FakeReply {
  const calls = message.tool_calls?.map((c, i) => ({
    id: c.id ?? `call_${i}`, type: 'function', function: { name: c.name, arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args) },
  }));
  return {
    body: { choices: [{ finish_reason: calls ? 'tool_calls' : 'stop', message: { role: 'assistant', content: message.content ?? null, ...(calls ? { tool_calls: calls } : {}), images: undefined } }] },
  };
}

/** Builds an image-generation reply carrying a base64 data URL. */
export function imageReply(bytes: Buffer, mime = 'image/png'): FakeReply {
  return {
    body: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '', images: [{ image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` } }] } }] },
  };
}
