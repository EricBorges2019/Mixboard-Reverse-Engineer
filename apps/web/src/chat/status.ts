/** Fixed status labels: SPEC.md §7.7 (main and style agents); the last five are ours. */
const LABELS: Record<string, string> = {
  create_image_block: 'Creating image...',
  create_text_block: 'Creating text...',
  load_skill: 'Gearing up...',
  update_image_block: 'Polishing the pixels...',
  save_style: '💾 Bottling up your aesthetic...',
  get_style: '🔍 Pulling your style from the vault...',
  delete_style: '🗑️ Saying goodbye to that look...',
  set_board_title: 'Naming the board...',
  delete_block: 'Tidying up...',
  remove_background: 'Cutting out the background...',
  update_text_block: 'Editing text...',
  ask_clarification: 'Thinking of questions...',
};

/**
 * Friendly status text for a running tool.
 * Precondition: none.
 * Postcondition: returns the fixed label for `toolName`, or `Working...` for unknown tools.
 */
export function statusLabel(toolName: string): string {
  return LABELS[toolName] ?? 'Working...';
}
