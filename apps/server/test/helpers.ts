import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent, AspectRatio, Settings } from '@mixboard/shared';
import { SkillRegistry } from '../src/agent/skills/registry';
import type { ToolContext } from '../src/agent/types';
import { openDb } from '../src/db';
import { LlmError, type ChatRequest, type ChatResult, type GeneratedImage, type ImageRequest, type Llm } from '../src/llm/types';
import { Repo } from '../src/repo';

export const defaultSettings: Settings = {
  puns: false,
  models: { agent: 'test/agent', caption: 'test/caption', tagline: 'test/tagline', image: 'test/image' },
};

export const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export function makeRepo(): { repo: Repo; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'mb-'));
  return { repo: new Repo(openDb(':memory:'), join(dir, 'files'), defaultSettings), dir };
}

/** A plain assistant text reply for ScriptedLlm. */
export function textReply(content: string): ChatResult {
  return { message: { role: 'assistant', content }, finishReason: 'stop' };
}

/** In-memory Llm: returns queued chat replies in order and records every call. */
export class ScriptedLlm implements Llm {
  chatCalls: ChatRequest[] = [];
  imageCalls: ImageRequest[] = [];
  constructor(
    public chatReplies: ChatResult[] = [],
    public imageBehaviour: () => GeneratedImage | Promise<GeneratedImage> = () => ({ bytes: PNG_BYTES, mimeType: 'image/png' }),
  ) {}
  async chat(req: ChatRequest): Promise<ChatResult> {
    this.chatCalls.push(req);
    const r = this.chatReplies.shift();
    if (!r) throw new LlmError('no scripted chat reply left');
    return r;
  }
  async generateImage(req: ImageRequest): Promise<GeneratedImage> {
    this.imageCalls.push(req);
    return this.imageBehaviour();
  }
}

/** Builds a ToolContext over a fresh in-memory repo with one project and board. */
export function makeCtx(opts: { llm?: ScriptedLlm; registry?: SkillRegistry; supportedRatios?: AspectRatio[]; onboarding?: boolean; loaded?: string[] } = {}) {
  const { repo } = makeRepo();
  const project = repo.createProject();
  const board = repo.createBoard(project.id);
  const events: AgentEvent[] = [];
  const imageAdded: string[] = [];
  const llm = opts.llm ?? new ScriptedLlm();
  const ctx: ToolContext = {
    repo, llm, models: defaultSettings.models, projectId: project.id, boardId: board.id,
    emit: (e) => events.push(e), signal: new AbortController().signal,
    onImageAdded: (id) => imageAdded.push(id),
    imageSupportedRatios: opts.supportedRatios ?? ['1:1', '4:3', '3:4', '16:9', '9:16'],
    session: { loadedSkills: new Set(opts.loaded ?? []), onboarding: opts.onboarding ?? false, endTurn: false },
    registry: opts.registry ?? new SkillRegistry([]),
  };
  return { ctx, repo, project, board, events, imageAdded, llm };
}
