import type { AgentEvent, AspectRatio, Models } from '@mixboard/shared';
import type { Llm } from '../llm/types';
import type { Repo } from '../repo';
import type { SkillRegistry } from './skills/registry';

export interface AgentSession {
  loadedSkills: Set<string>;
  onboarding: boolean;
  /** Set by a tool (ask_clarification) to end the turn after this step's tool calls finish. */
  endTurn: boolean;
}

export interface ToolContext {
  repo: Repo;
  llm: Llm;
  models: Models;
  projectId: string;
  boardId: string;
  emit(event: AgentEvent): void;
  signal: AbortSignal;
  onImageAdded(resourceId: string): void;
  imageSupportedRatios: AspectRatio[];
  session: AgentSession;
  registry: SkillRegistry;
}
