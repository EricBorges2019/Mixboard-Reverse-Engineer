import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bumpVersion, localDate, release, releaseChangelog } from './release.js';

const CHANGELOG = `# Changelog

## [Unreleased]

### Added
- Image toolbar.

## [0.3.0] - 2026-09-24

### Added
- Everything so far.
`;

describe('bumpVersion', () => {
  it('bumps each level and resets the lower parts', () => {
    expect(bumpVersion('0.3.2', 'patch')).toBe('0.3.3');
    expect(bumpVersion('0.3.2', 'minor')).toBe('0.4.0');
    expect(bumpVersion('0.3.2', 'major')).toBe('1.0.0');
  });

  it('rejects bad versions and levels', () => {
    expect(() => bumpVersion('0.3', 'minor')).toThrow(/not X.Y.Z/);
    expect(() => bumpVersion('0.3.0', 'huge')).toThrow(/must be one of/);
    expect(() => bumpVersion('0.3.0', undefined)).toThrow(/must be one of/);
  });
});

describe('localDate', () => {
  it('uses the local calendar date, zero-padded', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('releaseChangelog', () => {
  it('dates the Unreleased entries and opens a fresh empty section', () => {
    const out = releaseChangelog(CHANGELOG, '0.4.0', '2026-10-01');
    expect(out).toContain('## [Unreleased]\n\n## [0.4.0] - 2026-10-01\n\n### Added\n- Image toolbar.\n\n## [0.3.0]');
  });

  it('refuses when Unreleased has no entries', () => {
    const empty = CHANGELOG.replace('- Image toolbar.\n', '');
    expect(() => releaseChangelog(empty, '0.4.0', '2026-10-01')).toThrow(/nothing under Unreleased/);
  });

  it('refuses when the heading is missing', () => {
    expect(() => releaseChangelog('# Changelog\n', '0.4.0', '2026-10-01')).toThrow(/no "## \[Unreleased\]"/);
  });
});

describe('release (in a scratch git repo)', () => {
  let dir;
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'release-test-'));
    git('init', '-q');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'tag.gpgsign', 'false');
    writeFileSync(join(dir, 'package.json'), '{\n  "name": "x",\n  "version": "0.3.0",\n  "private": true\n}\n');
    writeFileSync(join(dir, 'CHANGELOG.md'), CHANGELOG);
    git('add', '.');
    git('commit', '-q', '-m', 'Initial');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('bumps, commits only the two files, and tags', () => {
    writeFileSync(join(dir, 'untracked.har'), 'secret');
    expect(release(dir, 'minor', new Date(2026, 9, 1))).toBe('0.4.0');
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(
      '{\n  "name": "x",\n  "version": "0.4.0",\n  "private": true\n}\n',
    );
    expect(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')).toContain('## [0.4.0] - 2026-10-01');
    expect(git('log', '-1', '--format=%s')).toBe('Release 0.4.0');
    expect(git('show', '--name-only', '--format=', 'HEAD').split('\n').sort()).toEqual(['CHANGELOG.md', 'package.json']);
    expect(git('describe', '--exact-match', 'HEAD')).toBe('v0.4.0');
    expect(git('cat-file', '-t', 'v0.4.0')).toBe('tag'); // annotated, not lightweight
    expect(git('status', '--porcelain')).toBe('?? untracked.har');
  });

  it('refuses on uncommitted tracked changes and writes nothing', () => {
    writeFileSync(join(dir, 'CHANGELOG.md'), CHANGELOG + '\nedit\n');
    expect(() => release(dir, 'minor')).toThrow(/Commit or stash/);
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toContain('"0.3.0"');
    expect(git('tag')).toBe('');
  });

  it('refuses when the tag already exists and writes nothing', () => {
    git('tag', 'v0.4.0');
    expect(() => release(dir, 'minor')).toThrow(/already exists/);
    expect(git('status', '--porcelain')).toBe('');
  });
});
