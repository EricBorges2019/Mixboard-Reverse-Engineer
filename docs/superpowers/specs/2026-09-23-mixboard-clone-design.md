# Mixboard Clone — Design

Date: 2026-09-23. Companion to `SPEC.md` (reverse-engineering findings, source of truth for
original behavior). This document covers what we build and how.

## 1. Intent

- **What:** a clone of Google Mixboard's canvas and AI agent, built before the original shuts
  down on 2026-09-28, including re-created prompts.
- **Who/how:** personal, local-first. Single user, no auth, runs on the user's machine.
- **Models:** all LLM and image calls go through **OpenRouter**. Image generation defaults to a
  Google image model. Model IDs are configuration, never hard-coded.
- **Wire protocol:** Google's `batchexecute` calls are a *reference only*. We use clean JSON REST
  and SSE and keep the same data-model semantics and agent stream semantics.
- **Product decisions carried over (SPEC §2):**
  - D1: users can edit AI-generated image captions (title + description).
  - D2: punny loading taglines exist behind a **Puns switch**, default off. When off, the server
    skips the tagline model call entirely and the client shows the fixed status labels (SPEC §7.7).

### Out of scope for v1

Export (Context Cartridge, PDF, slides, webpage), printable products, voice + pointing input
(`spatial-awareness-skill`), sharing, `create_document_block` / `create_table_block`, auth,
multi-user.

## 2. Structure

pnpm workspace, TypeScript throughout.

- `apps/web` — Vite, React, tldraw (pin the version; SPEC observed 4.3.0). Custom image shape,
  chat panel, inspector, style bank, settings, board list.
- `apps/server` — Hono. REST for projects/boards/blocks/uploads, one SSE endpoint for the agent.
- `packages/shared` — types and Zod schemas: Project, Board, Block, Resource, agent stream events.
- `prompts/` — persona prompt, caption prompt, tagline prompt, and one folder per skill
  (`SKILL.md` + tools). `image-generation-intent-skill`, `style-skill`, and `caption-prompt` are
  recovered verbatim files from the traffic capture; the rest are written fresh.

## 2a. Code convention: function contracts

Every function, including small helpers, React components and tool implementations, has a
comment directly above it with three parts:

- **Description:** what the function does, and why it exists if that isn't obvious.
- **Precondition:** what must be true of the arguments and surrounding state when it is called.
- **Postcondition:** what is guaranteed on return, including side effects and what happens on
  failure (throws, returns an error result, leaves state untouched).

```ts
/**
 * Merges a partial patch into a stored block and bumps its updatedAt.
 *
 * Precondition: `blockId` refers to an existing block; `patch` contains only mutable fields
 * (rect, zIndex, name, resources).
 * Postcondition: the block row holds the merged values and the merged block is returned.
 * Throws BlockNotFoundError and writes nothing if the block does not exist.
 */
```

Enforcement: a custom ESLint rule (`mixboard/function-contracts`) fails lint on any function whose
comment lacks a description, `Precondition:` or `Postcondition:`. Exempt: tests, and anonymous
callbacks passed inline as arguments (for example `.map((x) => ...)` or JSX event handlers).

## 3. Data model

Hierarchy from SPEC §5 (Project → Board → Block → Resource) as **named JSON fields**, not
positional arrays.

- Block: `type: "text" | "image"`, `rect {x,y,w,h}`, `zIndex`, `name`, `resources[]`,
  `generation` (the image prompt), `aspectRatio` as a string (`1:1`, `4:3`, `3:4`, `16:9`,
  `9:16`; the original's numeric codes are not kept).
- Resource (image): `mimeType`, file path, `caption {title, description, userEdited}`.
- Resource (text): the tldraw `richText` document plus `scale` and `autoSize`.
- Style artifact: `name`, Markdown `content` (six fixed sections, SPEC §7.4), preview image.
- Storage: SQLite tables `projects`, `boards`, `blocks`, `resources`, `styles`, `messages` (raw chat
  history), `settings`. Image bytes live on disk under `data/files/`; a `has_file` flag marks them.
  `node:sqlite` is used, so there is no native dependency.
- Updates are **partial block patches** (the idea behind the original's `nMLvne` field masks), so
  a drag doesn't rewrite the block. Viewport saves are debounced.
- Captions are an editable title and description. `userEdited` prevents regeneration from
  overwriting user edits (D1). Caption generation is an async background job after image creation.
  It uses the recovered caption prompt (`prompts/caption-prompt.md`), whose reply format is
  `LONG_DESCRIPTION` / `SHORT_LABEL` / `END_LABELS`, not JSON.

## 4. Agent

- `POST /api/agent/run` with `{projectId, boardId, message, selectedBlockIds, shortcut?, puns}`
  returns an SSE stream (Hono `streamSSE`).
- Each turn builds messages from the persona prompt, board context (block ids, names, rects,
  captions of selected images) and chat history, then calls OpenRouter with the currently
  unlocked tools. The loop runs until the model makes no more tool calls, with a step cap.
  Parallel tool calls in a step run concurrently. Tool errors are returned to the model as results.
- The raw assistant message is kept in history, because reasoning models need `reasoning_details`
  passed back unmodified. `tools` is sent on every request.
- **Skills:** `list_skills` and `load_skill` are always available. Loading unlocks that skill's
  tools and returns its `SKILL.md` to the model only. Unknown skill returns
  `{"error": "Skill '<name>' not found.", "error_code": "SKILL_NOT_FOUND"}`.
  - Verbatim: `image-generation-intent-skill`, `style-skill`.
  - Written fresh (only tool names and behavior are known, wording will differ from Google's):
    `text-generation-skill`, `core-board-skill`, `clarification-skill`, `board-starter-skill`
    (onboarding only).
- **v1 tools:** `create_image_block`, `update_image_block`, `remove_background`,
  `create_text_block`, `update_text_block`, `set_board_title`, `delete_block`,
  `ask_clarification`, `save_style`, `get_style`, `delete_style`.
- **Stream events:** `tagline`, `tool_call`, `tool_result`, `clarification`, `block`,
  `block_deleted`, `text`, `error`, and a final `done`. Generated images arrive as a placeholder
  block, then the finished block.
- **Onboarding** (`shortcut: 3`, empty board, no history): pre-load `board-starter-skill` and
  `clarification-skill`; the first turn asks two clarification questions; the user's picks return
  as one message (`;` between questions); then title + parallel image blocks + short summary.
  **Learn style** is `shortcut: 1`.
- **Taglines:** a separate fast model call fired in parallel with the turn, only when Puns is on.
- **Image generation:** OpenRouter chat completions with `image_config.aspect_ratio`; result read
  from `message.images[].image_url.url` (base64 data URL). `modalities` comes from the model's
  own `output_modalities` (looked up once from `/models`): Gemini image models take
  `["image","text"]`, image-only models such as `openai/gpt-image-2.5-flare` take `["image"]`.
  Default model `google/gemini-3.1-flash-image`; `openai/gpt-image-2.5-flare` is the approved
  alternative (accepts image input, cheaper per image).
- **Models:** separate configurable IDs for agent, caption, tagline and image.

## 5. Frontend

- **Canvas:** tldraw. **Text blocks are native tldraw text shapes** (`richText`, `scale`,
  `autoSize` already match the original's wrapped format); read the bare `{"type":"doc"}` form
  as well. **Image blocks** are a custom `BaseBoxShapeUtil` shape with a "Creating image..."
  placeholder state, an error state with Regenerate, and the caption title as a hover label.
- Position, size and z-index changes go out as debounced partial patches. Uploads by drag-drop or
  paste: create block, upload bytes, attach resource.
- **Chat panel:** streamed status labels and Markdown replies; `[[id:…|name:…]]` render as chips
  that focus the block; selected blocks are sent as `selectedBlockIds`; the clarification form
  shows questions with 4 suggestion chips each, multi-select.
- **Inspector:** caption title and description editor for a selected image (D1).
- **Style bank:** saved styles with previews and a Create style action.
- **Settings:** Puns switch (default off), model IDs. The OpenRouter key lives in the server's
  `.env` and is never sent to the browser.
- **Board list:** projects with thumbnails.

## 6. Errors

- Agent stream: tool failures go back to the model; model/network failure emits `error`, and the
  chat panel shows it with Retry. Client disconnect (`onAbort`) cancels the in-flight OpenRouter
  request.
- Image generation failure leaves the block in an error state, never spinning.
- Caption job retries a few times; on failure the caption stays empty and editable.
- Patches are optimistic; a rejected save shows an "unsaved" indicator.

## 7. Testing

- Vitest unit tests: tools, skill loader (including `SKILL_NOT_FOUND`), patch merge, the
  `userEdited` guard, shared schemas.
- Agent-loop integration tests against a scripted fake OpenRouter server: parallel tool calls,
  clarification-only turn, onboarding, Puns off makes no tagline call.
- Real captured tool calls (`captures/agent-calls-decoded.txt`) are replayed against our tool
  schemas and the clarification event shape. The capture is local and git-ignored, so this test
  skips itself when the file is absent.
- One Playwright smoke test (open board, send message against the fake server, blocks appear).
  Manual run with a real key last.

## 8. Verified against docs, and still open

Verified (Context7, 2026-09-23): tldraw custom `ShapeUtil` and `shapeUtils` registration;
built-in text shape props; OpenRouter tool-call round trip and image output format; Hono SSE.

Open, to settle in the plan or a spike:

1. Whether each candidate image model (`google/gemini-3.1-flash-image`, `openai/gpt-image-2.5-flare`)
   honors `image_config.aspect_ratio` for all five ratios. The plan's Task 6 probe answers this.
   Unsupported ratios are generated at the nearest supported one and the block keeps its shape.
2. Whether tldraw's `richText` is stored as a document object or a JSON string.
3. tldraw version pin (docs seen were 4.2.0; the original used 4.3.0).
4. The persona prompt, the tagline prompt and four skills (`text-generation-skill`,
   `core-board-skill`, `clarification-skill`, `board-starter-skill`) are reconstructions
   (SPEC §9); the wording is ours. The caption prompt is recovered verbatim.
