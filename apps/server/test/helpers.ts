import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Settings } from '@mixboard/shared';
import { openDb } from '../src/db';
import { Repo } from '../src/repo';

export const defaultSettings: Settings = {
  puns: false,
  models: { agent: 'test/agent', caption: 'test/caption', tagline: 'test/tagline', image: 'test/image' },
};

export function makeRepo(): { repo: Repo; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'mb-'));
  return { repo: new Repo(openDb(':memory:'), join(dir, 'files'), defaultSettings), dir };
}
