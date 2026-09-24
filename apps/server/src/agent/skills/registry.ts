import { z } from 'zod';
import type { ToolContext } from '../types';

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** The Zod schema arguments are validated with; also lets tests check captured real calls. */
  schema: z.ZodType;
  run(args: unknown, ctx: ToolContext): Promise<unknown>;
}

export interface Skill {
  name: string;
  description: string;
  skillMd: string;
  tools: ToolDef[];
  /** Hidden skills are not listed and only load on onboarding turns. */
  hidden?: boolean;
}

/**
 * Builds a tool whose JSON schema and argument validation both come from one Zod schema.
 * Precondition: `def.schema` is a Zod object schema.
 * Postcondition: the returned tool's `run` parses arguments with the schema first, so invalid arguments reject with a ZodError before `def.run` executes.
 */
export function defineTool<S extends z.ZodType>(def: {
  name: string;
  description: string;
  schema: S;
  run: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}): ToolDef {
  const { $schema: _omit, ...parameters } = z.toJSONSchema(def.schema) as Record<string, unknown>;
  return {
    name: def.name,
    description: def.description,
    parameters,
    schema: def.schema,
    /**
     * Validates then runs the tool.
     * Precondition: none; `args` may be any value.
     * Postcondition: resolves with the tool result; rejects with ZodError for invalid args.
     */
    run: async (args, ctx) => def.run(def.schema.parse(args), ctx),
  };
}

export class SkillRegistry {
  /**
   * Creates a registry.
   * Precondition: skill names are unique.
   * Postcondition: the registry holds the skills in the given order.
   */
  constructor(private readonly skills: Skill[]) {}

  /**
   * Renders the `list_skills` result.
   * Precondition: none.
   * Postcondition: returns `<available_skills>` XML listing every non-hidden skill's name and description.
   */
  listSkillsXml(): string {
    const body = this.skills
      .filter((s) => !s.hidden)
      .map((s) => `<skill>\n<name>\n${s.name}\n</name>\n<description>\n${s.description}\n</description>\n</skill>`)
      .join('\n');
    return `<available_skills>\n${body}\n</available_skills>`;
  }

  /**
   * Finds a skill by name regardless of visibility.
   * Precondition: none.
   * Postcondition: returns the skill or undefined.
   */
  get(name: string): Skill | undefined {
    return this.skills.find((s) => s.name === name);
  }

  /**
   * Resolves a skill for `load_skill`.
   * Precondition: none.
   * Postcondition: returns the skill, or `SKILL_NOT_FOUND` for unknown names and for hidden skills when `onboarding` is false.
   */
  load(name: string, onboarding: boolean): { skill: Skill } | { error: string; error_code: 'SKILL_NOT_FOUND' } {
    const skill = this.get(name);
    if (!skill || (skill.hidden && !onboarding)) return { error: `Skill '${name}' not found.`, error_code: 'SKILL_NOT_FOUND' };
    return { skill };
  }

  /**
   * Collects the tools unlocked by a set of loaded skills.
   * Precondition: none.
   * Postcondition: returns the tools of every skill whose name is in `loaded`, in registry order.
   */
  toolsFor(loaded: Iterable<string>): ToolDef[] {
    const names = new Set(loaded);
    return this.skills.filter((s) => names.has(s.name)).flatMap((s) => s.tools);
  }
}

/** Tools available on every turn: they discover and unlock the skill tools. */
export const metaTools: ToolDef[] = [
  defineTool({
    name: 'list_skills',
    description: 'List the available skills with their descriptions.',
    schema: z.object({}),
    /**
     * Returns the skills XML.
     * Precondition: `ctx.registry` is set.
     * Postcondition: returns the XML string; no state changes.
     */
    async run(_args, ctx) {
      return ctx.registry.listSkillsXml();
    },
  }),
  defineTool({
    name: 'load_skill',
    description: "Load a skill by name. This unlocks the skill's tools and returns its instructions.",
    schema: z.object({ skill_name: z.string() }),
    /**
     * Unlocks a skill for the rest of the turn.
     * Precondition: `ctx.session` and `ctx.registry` are set.
     * Postcondition: on success the skill name is in `loadedSkills` and its SKILL.md text is returned; otherwise the SKILL_NOT_FOUND error object is returned and nothing changes.
     */
    async run({ skill_name }, ctx) {
      const found = ctx.registry.load(skill_name, ctx.session.onboarding);
      if ('error' in found) return found;
      ctx.session.loadedSkills.add(skill_name);
      return found.skill.skillMd;
    },
  }),
];
