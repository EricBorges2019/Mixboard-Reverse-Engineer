# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->


## Project state

The clone is being implemented per `docs/superpowers/plans/2026-09-23-mixboard-clone.md` (design: `docs/superpowers/specs/2026-09-23-mixboard-clone-design.md`). Commands: `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`. Every function needs a description, `Precondition:` and `Postcondition:` comment (lint-enforced). `SPEC.md` remains the source of truth for the original's behavior.

## What this project is

Cloning Google Mixboard (an AI concepting canvas shutting down 2026-09-28) before it disappears, including its prompts. Read **`SPEC.md` first, in full, before any implementation work** — it is the single source of truth, assembled from two HAR captures and a decompiled frontend chunk, and is kept up to date as new findings land. Its "Open gaps" section (§9) lists what's still unknown; don't assume a gap is filled without checking there.

## Repo layout

- `SPEC.md` — the spec. Wire protocol (batchexecute RPCs), data model (Project → Board → Block → Resource, all positional arrays), the agent's skill/tool system, and product decisions already made (D1, D2 in §2).
- `captures/agent-calls-decoded.txt` — every captured agent call, decoded: user message, tagline, tool calls/results, final text. Primary evidence for agent behavior.
- `captures/rpc-samples.txt` — 2 request/response samples per `batchexecute` RPC. Primary evidence for the wire protocol.
- `prompts/skills/*.md` — recovered `SKILL.md` files for the agent's tool-skills (currently `image-generation-intent-skill.md`, `style-skill.md`). Treated as verbatim/real, not paraphrased, because they match traffic exactly.
- `mixboard.google.com.har`, `mixboard.google.com_learnstyle.har` — raw HAR captures. The learnstyle HAR is a superset (same session, plus the style-learning call). Contain no auth data was already stripped in `captures/`; treat the raw HARs themselves as sensitive and don't publish them.
- `issues.jsonl` — beads export artifact, not for manual editing (see Beads section above).

## Working with the evidence

- When SPEC.md and a capture file disagree, the capture is ground truth — update SPEC.md, don't trust its summary over the raw evidence.
- New findings (e.g. recovering another skill's `SKILL.md`, resolving an "Open gap") belong in `SPEC.md`, in the section they clarify, not as a separate notes file.
- Positional array fields in the data model (Project/Board/Block/Resource) are index-based and partially unconfirmed ("?" in SPEC.md tables) — verify against `captures/rpc-samples.txt` before relying on an unconfirmed index.
