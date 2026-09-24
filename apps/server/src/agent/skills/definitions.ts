import { readPrompt } from '../prompts';
import { boardTools } from '../tools/board';
import { clarificationTools } from '../tools/clarification';
import { imageTools } from '../tools/image';
import { styleTools } from '../tools/style';
import { textTools } from '../tools/text';
import type { Skill } from './registry';

/** Descriptions as captured in SPEC.md §7.2 (`list_skills` result). */
export const DESCRIPTIONS = {
  text: 'REQUIRED to generate, position, and edit text blocks on the Mixboard canvas.\nIf the user asks for text or writing, you MUST `load_skill` this skill to\nunlock the `create_text_block` and `update_text_block` tools!\n',
  core: 'REQUIRED to manage basic board context like naming the board and deleting blocks.\nIf the user asks to delete a block or name the board, you MUST `load_skill` this skill\nto unlock the `set_board_title` and `delete_block` tools!\n',
  image: 'Create and modify images using AI, including editing existing images and generating variations.',
  style: 'Manage style artifacts with structured extraction for image generation.',
  clarification:
    "Present multiple-choice clarifying questions to the user via\n`ask_clarification`. This skill is pre-loaded automatically during\nempty board onboarding via the shortcut mechanism — you do not need\nto decide when to load it yourself.\nOn non-onboarding turns, do NOT use this skill unless the user's\nrequest is genuinely incomprehensible (not merely vague — truly\nunintelligible). This should be extremely rare.\nCRITICAL: `ask_clarification` must be the ONLY tool call in a turn.\nNever combine it with `generate_image`, `create_text_block`,\nor any other tool. Wait for the user to respond before taking further action.\n",
};

/**
 * Assembles every skill the agent knows about.
 * Precondition: the prompt files under `prompts/skills/` exist.
 * Postcondition: returns the five public skills in the original order plus the hidden `board-starter-skill`. `spatial-awareness-skill` is intentionally absent (out of scope for v1).
 */
export function buildSkills(): Skill[] {
  /**
   * Reads one skill's SKILL.md.
   * Precondition: `name` is a file stem under `prompts/skills/`.
   * Postcondition: returns the trimmed text.
   */
  const md = (name: string) => readPrompt(`skills/${name}.md`);
  return [
    { name: 'text-generation-skill', description: DESCRIPTIONS.text, skillMd: md('text-generation-skill'), tools: textTools },
    { name: 'core-board-skill', description: DESCRIPTIONS.core, skillMd: md('core-board-skill'), tools: boardTools },
    { name: 'image-generation-intent-skill', description: DESCRIPTIONS.image, skillMd: md('image-generation-intent-skill'), tools: imageTools },
    { name: 'style-skill', description: DESCRIPTIONS.style, skillMd: md('style-skill'), tools: styleTools },
    { name: 'clarification-skill', description: DESCRIPTIONS.clarification, skillMd: md('clarification-skill'), tools: clarificationTools },
    { name: 'board-starter-skill', description: 'Kick-start an empty board.', skillMd: md('board-starter-skill'), tools: [], hidden: true },
  ];
}
