# WARNING! THIS IS 100% VIBE-CODED!

# Mixboard Clone

A personal, local-first clone of Google Mixboard: an infinite canvas of images and text with an AI agent that builds boards for you. Google's Mixboard shuts down on 2026-09-28; this project rebuilds it from the reverse-engineering notes in `SPEC.md`.

Design: `docs/superpowers/specs/2026-09-23-mixboard-clone-design.md`. Plan: `docs/superpowers/plans/2026-09-23-mixboard-clone.md`.

## Run it

Needs Node 24 and pnpm 11.

```bash
pnpm install
cp -n .env.example .env     # skips if .env exists; then put your OpenRouter key in OPENROUTER_API_KEY
pnpm dev                    # server on :8787, app on http://localhost:5173
```

Data (SQLite and image files) lives in `data/`.

## Models

All model calls go through [OpenRouter](https://openrouter.ai). Defaults are in `apps/server/src/config.ts` and can be overridden in `.env` or in the app's Settings tab. Image default: `google/gemini-3.1-flash-image`; `openai/gpt-image-2.5-flare` also works as an alternative. Check that your configured ids exist, and probe aspect-ratio support, with:

```bash
pnpm --filter @mixboard/server check-models          # ids only, free
pnpm --filter @mixboard/server check-models --live   # generates 5 small images
```

## Checks

```bash
pnpm lint       # includes the function-contract rule
pnpm typecheck
pnpm test
pnpm e2e        # Playwright against a fake OpenRouter; needs `pnpm exec playwright install chromium` once
```

## Conventions

Every function has a comment above it with a description, a `Precondition:` and a `Postcondition:` (enforced by lint).
