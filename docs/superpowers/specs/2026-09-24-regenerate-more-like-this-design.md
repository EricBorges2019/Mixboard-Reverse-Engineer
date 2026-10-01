# Regenerate and More like this — design

Date: 2026-09-24. Replaces the first version of these buttons, which sent chat messages to the agent. Evidence: SPEC §4.6 (two HAR captures of the real Mixboard), D3, D4.

## Goal

Two buttons on a selected image, matching what Mixboard's buttons do:

| | Keeps | Changes | Output |
|---|---|---|---|
| **Regenerate** | core concept, genre, medium | character, gear, pose, setting, lighting, palette | 1 new block, a new take |
| **More like this** | subject, gear, pose, framing, mood | small details, background | 3 new blocks, faithful siblings |

Neither goes through the agent, and neither ever changes the source block.

## Server

New file `apps/server/src/routes/imageActions.ts`, registered in `app.ts`:

- `POST /api/blocks/:id/regenerate`
- `POST /api/blocks/:id/more-like-this`

Both stream Server-Sent Events in the agent's event format (`block` events with `isPlaceholder`, then `done`, or `error`), so the client reuses its existing SSE parser and block handling. The source must be an image block with a stored file; otherwise the route answers 400 before streaming.

The pipelines live in `apps/server/src/imageActions/` (one file each), separate from the route so they can be tested with `ScriptedLlm` like the agent tools.

### Regenerate

1. Create the placeholder block (name `""`, status `generating`) at source + (40, 40), and emit it.
   - Crop setting on: the source's exact size.
   - Crop setting off: landscape, with the long side equal to the source's long side (4:3), until the real shape is known.
2. Ask the caption model (vision) with `prompts/regenerate-prompt.md` plus the source image. The reply is one image prompt.
3. Generate from that prompt alone: aspect `1:1`, no reference image.
4. Store the image, and set the block's prompt to the generated prompt.
   - Crop off: resize the block to the image's real shape (`readPngSize`), long side equal to the source's long side.
5. Mark the block ready, emit it, and enqueue the normal caption job.

### More like this

1. Ask the caption model with `prompts/more-like-this-prompt.md` plus the source image. The reply is a short title and three descriptions, in a labelled plain-text format parsed like the caption reply.
2. Create three placeholders named `<Title> Variant 1..3`, each the source's size, in a row starting at (source.x, source.y + source.h + 40), 20 px apart. Emit them.
3. Generate the three in parallel, each from its own description, at the source's aspect ratio (`nearestRatio`), with no reference image.
4. Store each description as that block's prompt and as its caption (title `""`, not user-edited). Skip the caption job for these blocks.

The row position is our choice; Mixboard's (far below the source) is unexplained (SPEC §9).

### Failure

If the prompt-writing step fails, every placeholder of that action becomes `error`, and the stream ends with an `error` event. If one image fails, only that block becomes `error`; the others finish. A client disconnect aborts the model calls, as the agent route does.

### Prompts

`prompts/regenerate-prompt.md` and `prompts/more-like-this-prompt.md` are **our reconstructions** from observed outputs, not recovered text. SPEC §4.6 and the code that loads them say so; the files themselves carry no header, because `readPrompt` sends a file to the model verbatim. Both follow D3 and do not name characters or IP.

### Kept from the first version

`update_image_block` always creates a new block (SPEC §7.3). This is independent of the buttons.

## Settings (D4)

- Add `cropRegenerated: boolean` (default `true`) to `Settings` and `SettingsPatch` in `packages/shared`, with a stored default in the settings table.
- A switch in the Settings panel: "Crop regenerated images to the source's shape".

## Client

- `ImageToolbar` buttons call the new endpoints (new functions in `api/client.ts` using the existing SSE reader) and feed each `block` event to `BoardView.applyBlock`.
- The buttons are **not** disabled while the agent runs; the actions are independent of chat.
- The action-to-chat-message plumbing from the first version is removed, apart from the failed-placeholder Regenerate button. That button still asks the agent via chat, because a failed block has no image to reinterpret.
- Errors from an action show in the existing save-error banner.

## Testing

- **Server (pipelines):**
  - Regenerate makes one vision call with the source image, then one `1:1` image call with no references.
  - Placement and sizing, with crop on and off.
  - The source block is never touched.
  - More like this makes three image calls at the source's ratio, with names, row placement and captions set.
  - Failure paths: the prompt step fails; one image fails.
- **Server (route):** SSE event order; 400 for a text block or an image without a file.
- **Web:** the toolbar calls the right endpoint, and events reach `applyBlock`; the settings switch.
- **End-to-end:** the fake OpenRouter answers the two new prompts, and the smoke test checks both buttons.
- **Live:** the user compares the results against their Mixboard captures.

## Out of scope

- More like this's three follow-up suggestions.
- The unknown `[null, 4]` field.
- Sending a stored prompt on Regenerate (unknown whether Mixboard does).
