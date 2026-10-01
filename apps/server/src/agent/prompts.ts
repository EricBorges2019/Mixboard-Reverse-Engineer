import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROMPTS_DIR = fileURLToPath(new URL('../../../../prompts/', import.meta.url));

/**
 * Reads a prompt file from the repository's `prompts/` directory.
 * Precondition: `relPath` is relative to `prompts/` (for example `skills/style-skill.md`) and the file exists.
 * Postcondition: returns the file's text with surrounding whitespace trimmed; throws if the file is missing.
 */
export function readPrompt(relPath: string): string {
  return readFileSync(PROMPTS_DIR + relPath, 'utf8').trim();
}
