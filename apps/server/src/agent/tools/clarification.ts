import { z } from 'zod';
import { defineTool, type ToolDef } from '../skills/registry';

export const clarificationTools: ToolDef[] = [
  defineTool({
    name: 'ask_clarification',
    description: 'Ask the user multiple-choice clarifying questions. Must be the only tool call in the turn.',
    schema: z.object({
      questions: z.array(z.object({ question: z.string().min(1), suggestions: z.array(z.string().min(1)).length(4) })).min(1).max(4),
    }),
    /**
     * Shows a clarification form and ends the turn.
     * Precondition: each question has exactly four suggestions (validated).
     * Postcondition: a `clarification` event was emitted, `ctx.session.endTurn` is true, and `{status: 'awaiting_user_response'}` is returned.
     */
    async run({ questions }, ctx) {
      ctx.emit({ type: 'clarification', questions });
      ctx.session.endTurn = true;
      return { status: 'awaiting_user_response' };
    },
  }),
];
