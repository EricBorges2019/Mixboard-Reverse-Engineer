# Changelog

All notable changes to the Mixboard clone. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). While the version is 0.x, a minor bump marks a new batch of features and a patch bump marks fixes only.

Add a line under **Unreleased** whenever a change lands that a user of the app would notice. `pnpm release patch|minor|major` turns that section into the next version (see `readme.md`).

## [Unreleased]

### Added
- Settings panel fields to enter a provider API key and a custom base URL (any OpenAI-compatible chat-completions endpoint — OpenRouter, OpenAI, or a local server), overriding `OPENROUTER_API_KEY`/`OPENROUTER_BASE_URL` from `.env` without a server restart. The key is masked once set and never round-trips back to the browser in full.

### Fixed
- The "Generation failed" notice no longer spills past its block on Linux, where the system font is wider.

## [0.3.1] - 2026-09-24

### Added
- Floating toolbar above a selected image with **Regenerate** and **More like this**, run by the server as in Mixboard (SPEC §4.6). Regenerate makes one loose reinterpretation next to the source; More like this makes three close variants in a row below it.
- Setting to crop Regenerate's square image to the source's shape (on by default, D4).
- Image lineage (D5): every image made from other images records where it came from. The Inspector shows "Based on" and "Used by" chips, and arrows run from each source to its derivatives, shown while L is held or always, with a fade setting.
- **Try again** on a failed image re-runs the same generation into the same block.
- ☰ menu at the top left with **All projects**, to return to the project list.

### Changed
- Editing an image always creates a new block next to the source instead of replacing the image in place, matching Mixboard (SPEC §7.3).
- Image captions describe known characters and IP by appearance instead of naming them (D3).
- The "Generation failed" and "Creating image..." notices scale with their block.
- Images the agent generates store their full prompt, style included.
- The database gains an `origin` column, added automatically on first start.

## [0.3.0] - 2026-09-24

First tracked version. Earlier work was not versioned.

### Added
- Reverse-engineering spec (`SPEC.md`), decoded captures and recovered agent prompts and skills.
- pnpm workspace: a shared schema package, a server and a web app. Every function carries a description, precondition and postcondition, enforced by lint.
- Server: SQLite storage, REST routes, uploads and file serving, an OpenRouter client with a fake server for tests, and a script that checks the configured model ids.
- Agent loop streamed over SSE, with tools for boards, text, images, clarifications and styles, and caption and tagline jobs.
- Web app: an infinite canvas (tldraw) synced to board blocks, a chat panel with a clarification form, an inspector, a style bank, settings, and the app shell.
- Playwright smoke test against the fake OpenRouter.
