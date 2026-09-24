import { ZodError } from 'zod';
import type { AgentEvent, AgentRunRequest } from '@mixboard/shared';
import type { Config } from '../config';
import { generateTagline } from '../jobs/tagline';
import type { ChatMessage, Llm, ToolCall, ToolSpec } from '../llm/types';
import type { Repo } from '../repo';
import { buildSystemPrompt, withSelection } from './context';
import { readPrompt } from './prompts';
import { metaTools, type SkillRegistry, type ToolDef } from './skills/registry';
import type { AgentSession, ToolContext } from './types';

export interface AgentDeps {
  repo: Repo;
  llm: Llm;
  registry: SkillRegistry;
  config: Config;
  onImageAdded(resourceId: string): void;
}

/**
 * Converts a tool definition to OpenRouter's tool format.
 * Precondition: none.
 * Postcondition: returns a `function` tool spec.
 */
function toSpec(t: ToolDef): ToolSpec {
  return { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } };
}

/**
 * Executes one tool call and produces the `tool` message for the model.
 * Precondition: `call` came from the model in this step; `tools` are the tools unlocked at the start of the step.
 * Postcondition: emits `tool_call` then `tool_result`; unknown tools, malformed JSON and thrown errors become `{error}` results (the model can recover). load_skill's result is shown to the client as `{skill_name}` only, never the skill text. Rethrows when the run was aborted.
 */
async function runToolCall(call: ToolCall, tools: ToolDef[], ctx: ToolContext, emit: (e: AgentEvent) => void): Promise<ChatMessage> {
  const { name, arguments: raw } = call.function;
  let args: unknown = {};
  let badJson = false;
  try {
    if (raw) args = JSON.parse(raw);
  } catch {
    badJson = true;
  }
  emit({ type: 'tool_call', id: call.id, name, args: badJson ? raw : args });
  const tool = tools.find((t) => t.name === name);
  let result: unknown;
  if (!tool) result = { error: `Tool '${name}' is not available. Load the skill that provides it first.` };
  else if (badJson) result = { error: 'Arguments were not valid JSON.' };
  else {
    try {
      result = await tool.run(args, ctx);
    } catch (err) {
      if (ctx.signal.aborted) throw err;
      result = { error: err instanceof ZodError ? `Invalid arguments: ${err.message}` : err instanceof Error ? err.message : String(err) };
    }
  }
  const forClient = name === 'load_skill' && typeof result === 'string' ? { skill_name: (args as { skill_name?: string }).skill_name } : result;
  emit({ type: 'tool_result', id: call.id, name, result: forClient });
  return { role: 'tool', tool_call_id: call.id, content: typeof result === 'string' ? result : JSON.stringify(result) };
}

/**
 * Runs one agent turn: model call, tool execution, repeat until the model answers in text, asks a clarification, hits the step cap, fails, or is aborted.
 * Precondition: `req` is validated and its board exists; `deps` are ready.
 * Postcondition: events were emitted through `emit` (never `done`, the route does that). Model and tool failures produce an `error` event, not a rejection. An abort returns silently without an error event. The user message and every *complete* step are appended to the board's history; a half-finished step (assistant tool calls without all results) is never stored.
 */
export async function runAgent(input: { req: AgentRunRequest; deps: AgentDeps; emit: (e: AgentEvent) => void; signal: AbortSignal }): Promise<void> {
  const { req, deps, emit, signal } = input;
  const { repo, llm, registry, config } = deps;
  const settings = repo.getSettings();
  const board = repo.getBoard(req.boardId);
  const history = repo.listMessages(req.boardId) as ChatMessage[];
  const onboarding = req.shortcut === 3 && board.blocks.length === 0 && history.length === 0;
  const preloaded = onboarding ? ['board-starter-skill', 'clarification-skill'] : req.shortcut === 1 ? ['style-skill'] : [];
  const session: AgentSession = { loadedSkills: new Set(preloaded), onboarding, endTurn: false };
  const ctx: ToolContext = {
    repo, llm, models: settings.models, projectId: board.projectId, boardId: board.id, emit, signal,
    onImageAdded: deps.onImageAdded, imageSupportedRatios: config.imageSupportedRatios, session, registry,
  };
  const system = buildSystemPrompt({
    persona: readPrompt('persona.md'),
    board,
    preloadedSkillMd: preloaded.flatMap((n) => registry.get(n)?.skillMd ?? []),
  });
  const newMessages: ChatMessage[] = [{ role: 'user', content: withSelection(req.message, board, req.selectedBlockIds) }];
  let committed = 1;
  let finished = false;

  if (req.puns) {
    void generateTagline({ llm, model: settings.models.tagline, message: req.message, signal }).then((text) => {
      if (text && !finished) emit({ type: 'tagline', text });
    });
  }

  try {
    for (let step = 0; step < config.maxAgentSteps; step++) {
      const tools = [...metaTools, ...registry.toolsFor(session.loadedSkills)];
      const { message } = await llm.chat({
        model: settings.models.agent,
        messages: [{ role: 'system', content: system }, ...history, ...newMessages],
        tools: tools.map(toSpec),
        signal,
      });
      const calls = message.tool_calls ?? [];
      if (calls.length === 0) {
        newMessages.push(message);
        committed = newMessages.length;
        emit({ type: 'text', text: typeof message.content === 'string' ? message.content : '' });
        return;
      }
      const results = await Promise.all(calls.map((call) => runToolCall(call, tools, ctx, emit)));
      newMessages.push(message, ...results);
      committed = newMessages.length;
      if (session.endTurn) return;
    }
    emit({ type: 'error', message: `Stopped after ${config.maxAgentSteps} steps without a final answer.` });
  } catch (err) {
    if (signal.aborted) return;
    emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    finished = true;
    repo.appendMessages(req.boardId, newMessages.slice(0, committed));
  }
}
