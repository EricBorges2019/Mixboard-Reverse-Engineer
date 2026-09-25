# Changelog

All notable changes to the Mixboard clone. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). While the version is 0.x, a minor bump marks a new batch of features and a patch bump marks fixes only.

Add a line under **Unreleased** whenever a change lands that a user of the app would notice. `pnpm release patch|minor|major` turns that section into the next version (see `readme.md`).

## [Unreleased]

### Added
- Floating toolbar above a selected image with **Regenerate** and **More like this**, which ask the agent to act on that image through the chat.

### Changed
- Editing an image always creates a new block next to the source instead of replacing the image in place, matching Mixboard (SPEC §7.3).

## [0.3.0] - 2026-09-24

First tracked version. Earlier work was not versioned.

### Added
- Reverse-engineering spec (`SPEC.md`), decoded captures and recovered agent prompts and skills.
- pnpm workspace: a shared schema package, a server and a web app. Every function carries a description, precondition and postcondition, enforced by lint.
- Server: SQLite storage, REST routes, uploads and file serving, an OpenRouter client with a fake server for tests, and a script that checks the configured model ids.
- Agent loop streamed over SSE, with tools for boards, text, images, clarifications and styles, and caption and tagline jobs.
- Web app: an infinite canvas (tldraw) synced to board blocks, a chat panel with a clarification form, an inspector, a style bank, settings, and the app shell.
- Playwright smoke test against the fake OpenRouter.
