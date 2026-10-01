## Overview

Create and edit text blocks on the Mixboard canvas: notes, descriptions, lists, copy and other writing that belongs next to the images.

## Guidelines

*   **Put writing on the board, not in chat.** When the user asks for text, create it with `create_text_block` and mention it briefly in chat instead of pasting the whole text.
*   **Placement.** Place new blocks near related content and never on top of existing blocks. Leave about 50 px between blocks.
*   **Size.** The default width is 350 and the default height is 100. Increase `height` for longer text (about 20 px per line).
*   **Naming.** Give every block a short descriptive `name` (2 to 5 words).
*   **Editing.** To change existing text, call `update_text_block` with the block id from the board context or from an earlier tool result. Send the complete new text, not a diff.
*   **Formatting.** Write plain text. Separate paragraphs with a blank line. Do not use Markdown syntax.

## Tools

*   `create_text_block(generated_text_content, x=0, y=0, width=350, height=100, name)`
*   `update_text_block(update_block_id, generated_text_content)`

Both return the `block_id` of the block. Use it to refer to the block afterwards, as `[[id:<block_id>|name:<name>]]`.
