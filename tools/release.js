// Cuts a release: `pnpm release patch|minor|major`.
//
// The version lives in the root package.json (the workspace packages carry none). CHANGELOG.md follows
// Keep a Changelog: changes collect under `## [Unreleased]` as they land, and a release renames that
// section to `## [X.Y.Z] - YYYY-MM-DD` and opens a fresh empty one above it. The script then commits
// exactly those two files as "Release X.Y.Z" and adds an annotated tag `vX.Y.Z`. It never pushes.
//
// Everything is checked before anything is written, so a refused release leaves the repo untouched.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LEVELS = ['major', 'minor', 'patch'];
const UNRELEASED = '## [Unreleased]';

/**
 * Computes the next semantic version.
 * Precondition: `version` is `X.Y.Z` with non-negative integers; `level` is one of major, minor, patch.
 * Postcondition: returns the bumped version with every lower part reset to 0 (0.3.2 minor → 0.4.0); throws on bad input.
 */
export function bumpVersion(version, level) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`package.json version "${version}" is not X.Y.Z.`);
  if (!LEVELS.includes(level)) throw new Error(`Release level must be one of ${LEVELS.join(', ')}; got "${level}".`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Formats a date as YYYY-MM-DD in local time.
 * Precondition: `date` is a valid Date.
 * Postcondition: returns the local calendar date; toISOString would give the UTC one, which is tomorrow late in the evening.
 */
export function localDate(date) {
  const [month, day] = [date.getMonth() + 1, date.getDate()].map((n) => String(n).padStart(2, '0'));
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Turns the changelog's Unreleased section into a dated release section.
 * Precondition: `text` is a Keep a Changelog file containing exactly one `## [Unreleased]` heading.
 * Postcondition: returns the text with a new empty Unreleased heading followed by `## [version] - date`
 * holding what Unreleased held; throws when the heading is missing or the section has no entries.
 */
export function releaseChangelog(text, version, date) {
  const start = text.indexOf(UNRELEASED);
  if (start === -1) throw new Error(`CHANGELOG.md has no "${UNRELEASED}" heading.`);
  const bodyStart = start + UNRELEASED.length;
  const next = text.indexOf('\n## [', bodyStart);
  const bodyEnd = next === -1 ? text.length : next;
  // Sub-headings like "### Added" alone don't count as entries; a list item does.
  if (!/^\s*[-*] \S/m.test(text.slice(bodyStart, bodyEnd))) {
    throw new Error('CHANGELOG.md has nothing under Unreleased. Add entries for what changed before releasing.');
  }
  return `${text.slice(0, bodyStart)}\n\n## [${version}] - ${date}${text.slice(bodyStart)}`;
}

/**
 * Runs git in `cwd` and returns its trimmed stdout.
 * Precondition: `cwd` is inside a git repository.
 * Postcondition: returns stdout; throws (with git's stderr) when git exits non-zero.
 */
function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * Checks every release precondition, then bumps, commits and tags.
 * Precondition: `cwd` is inside the repository; `level` is the requested release level.
 * Postcondition: on success package.json and CHANGELOG.md are updated, committed alone as "Release X.Y.Z"
 * and tagged `vX.Y.Z`, and the new version is returned. On any refusal it throws before writing anything.
 */
export function release(cwd, level, date = new Date()) {
  const root = git(cwd, 'rev-parse', '--show-toplevel');
  const pkgPath = join(root, 'package.json');
  const changelogPath = join(root, 'CHANGELOG.md');

  // Untracked files (HARs, captures, scratch) are fine; uncommitted edits to tracked files are not,
  // because the tag must point at exactly what was released.
  const dirty = git(root, 'status', '--porcelain', '--untracked-files=no');
  if (dirty) throw new Error(`Commit or stash these changes first:\n${dirty}`);

  const pkgText = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(pkgText);
  const version = bumpVersion(pkg.version ?? '', level);
  const tag = `v${version}`;
  if (git(root, 'tag', '--list', tag)) throw new Error(`Tag ${tag} already exists.`);
  const changelog = releaseChangelog(readFileSync(changelogPath, 'utf8'), version, localDate(date));

  // Swap only the version string so the file's formatting and key order stay as they were.
  writeFileSync(pkgPath, pkgText.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`));
  writeFileSync(changelogPath, changelog);
  git(root, 'add', '--', 'package.json', 'CHANGELOG.md');
  git(root, 'commit', '-m', `Release ${version}`);
  git(root, 'tag', '-a', tag, '-m', `Release ${version}`);
  return version;
}

/**
 * Command-line entry point.
 * Precondition: called with the release level as the first argument.
 * Postcondition: prints the result and how to publish it, or prints the refusal and exits with status 1.
 */
function main() {
  try {
    const version = release(process.cwd(), process.argv[2]);
    console.log(`Released ${version} and tagged v${version}. Nothing was pushed; to publish:`);
    console.log(`  git push && git push origin v${version}`);
  } catch (err) {
    console.error(`Release refused: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

// Run only when executed directly, so tests can import the helpers without cutting a release.
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
