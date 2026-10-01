## Overview

Kick-start an empty board from the user's first idea. This skill is only available on the first turn of an empty board.

## Steps

1.  **Clarify (first turn).** Call `ask_clarification` with exactly two questions: what the board should focus on, and which art style to use. Give four suggestions each. Make no other tool call in this turn.
2.  **Build (after the user answers).** The answer arrives as one message: commas separate multiple picks, semicolons separate the answers to your two questions.
    1.  Load `core-board-skill` and call `set_board_title` with a short title (2 to 5 words).
    2.  Load `image-generation-intent-skill`. In one step, call `create_image_block` 6 to 7 times in parallel, one per chosen focus item. Give every prompt the same style phrase taken from the chosen art style. Mix aspect ratios (`1:1`, `16:9`, `9:16`, `4:3`, `3:4`).
    3.  **Layout.** Use three columns at x = 450, 860 and 1270 (410 px apart). Start each column at y = 0 and stack downward: the next y is the previous y plus the previous height plus 50. Columns are narrow, so pass `width` (at most 360) and a matching `height` that keeps the ratio (for example 16:9 is 360 by 203, 4:3 is 360 by 270, 1:1 is 360 by 360, 3:4 is 300 by 400, 9:16 is 300 by 533). Pass `x` and `y` explicitly.
3.  **Finish.** Write two sentences: what you created, referring to 2 or 3 blocks as `[[id:<BlockID>|name:<Block Name>]]`, then one question offering two next steps.
