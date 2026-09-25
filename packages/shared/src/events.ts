import { z } from 'zod';
import { Block } from './schemas';

export const ClarificationQuestion = z.object({ question: z.string(), suggestions: z.array(z.string()) });
export type ClarificationQuestion = z.infer<typeof ClarificationQuestion>;

export const AgentEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tagline'), text: z.string() }),
  z.object({ type: z.literal('tool_call'), id: z.string(), name: z.string(), args: z.unknown() }),
  z.object({ type: z.literal('tool_result'), id: z.string(), name: z.string(), result: z.unknown() }),
  z.object({ type: z.literal('clarification'), questions: z.array(ClarificationQuestion) }),
  z.object({ type: z.literal('block'), block: Block, isPlaceholder: z.boolean() }),
  z.object({ type: z.literal('block_deleted'), blockId: z.string() }),
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
  z.object({ type: z.literal('done') }),
]);
export type AgentEvent = z.infer<typeof AgentEvent>;

export const AgentRunRequest = z.object({
  projectId: z.string(),
  boardId: z.string(),
  message: z.string().trim().min(1),
  selectedBlockIds: z.array(z.string()).default([]),
  shortcut: z.union([z.literal(1), z.literal(3)]).optional(),
  puns: z.boolean().default(false),
});
export type AgentRunRequest = z.infer<typeof AgentRunRequest>;
