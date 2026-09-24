## Overview

Manage basic board context: naming the board and deleting blocks.

## Guidelines

*   **Board title.** Call `set_board_title` once the board's theme is clear (for example after the first images are created). Use 2 to 5 words in Title Case. Do not rename a board the user has already named unless they ask.
*   **Deleting.** Call `delete_block` only when the user explicitly asks to remove something. Deleting is permanent. When the user wants to replace or change an image, create a new block instead and leave the original.
*   **Ids.** Use the exact block id from the board context or from tool output.

## Tools

*   `set_board_title(title)`
*   `delete_block(block_id)`
