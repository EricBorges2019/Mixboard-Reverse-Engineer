import type {
  Block, BlockPatch, Board, NewBlockInput, Project, Resource, Settings, SettingsPatch, StyleArtifact, Viewport,
} from '@mixboard/shared';

export class ApiError extends Error {
  /**
   * Builds an error for a non-2xx API response.
   * Precondition: `status` is the HTTP status; `message` is the server error text.
   * Postcondition: `name` is ApiError and `status` is kept for callers.
   */
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Calls the JSON API.
 * Precondition: `path` starts with `/api`.
 * Postcondition: returns the parsed JSON body (undefined for 204); throws ApiError carrying the server's `error` message on a non-2xx response.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? res.statusText);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/**
 * Builds fetch options for a JSON body.
 * Precondition: `body` is JSON-serializable.
 * Postcondition: returns method, JSON content type and serialized body.
 */
function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

/**
 * URL that serves a stored image.
 * Precondition: none.
 * Postcondition: returns `/api/files/<resourceId>`.
 */
export function fileUrl(resourceId: string): string {
  return `/api/files/${resourceId}`;
}

/**
 * Lists projects.
 * Precondition: the server is reachable.
 * Postcondition: returns projects, most recently updated first.
 */
export function listProjects(): Promise<Project[]> {
  return request('/api/projects');
}

/**
 * Creates a project with its first board.
 * Precondition: none.
 * Postcondition: returns the new project and board.
 */
export function createProject(title?: string): Promise<{ project: Project; board: Board }> {
  return request('/api/projects', json('POST', { title }));
}

/**
 * Loads a project and its board list.
 * Precondition: the project exists (else ApiError 404).
 * Postcondition: returns the project and `{id,title}` of each board.
 */
export function getProject(id: string): Promise<{ project: Project; boards: { id: string; title: string }[] }> {
  return request(`/api/projects/${id}`);
}

/**
 * Loads a board with its blocks.
 * Precondition: the board exists (else ApiError 404).
 * Postcondition: returns the board.
 */
export function getBoard(id: string): Promise<Board> {
  return request(`/api/boards/${id}`);
}

/**
 * Saves a board's title and/or viewport.
 * Precondition: the board exists.
 * Postcondition: returns the updated board.
 */
export function patchBoard(id: string, patch: { title?: string; viewport?: Viewport }): Promise<Board> {
  return request(`/api/boards/${id}`, json('PATCH', patch));
}

/**
 * Creates a block.
 * Precondition: the board exists; `input` is a valid NewBlock.
 * Postcondition: returns the created block.
 */
export function createBlock(boardId: string, input: NewBlockInput): Promise<Block> {
  return request(`/api/boards/${boardId}/blocks`, json('POST', input));
}

/**
 * Applies a partial block patch.
 * Precondition: the block exists.
 * Postcondition: returns the updated block.
 */
export function patchBlock(id: string, patch: BlockPatch): Promise<Block> {
  return request(`/api/blocks/${id}`, json('PATCH', patch));
}

/**
 * Saves a text block's rich-text content.
 * Precondition: the block exists.
 * Postcondition: returns the updated block.
 */
export function patchBlockText(id: string, content: unknown): Promise<Block> {
  return request(`/api/blocks/${id}/text`, json('PATCH', { content }));
}

/**
 * Deletes a block.
 * Precondition: the block exists.
 * Postcondition: the block is gone server-side.
 */
export function deleteBlock(id: string): Promise<void> {
  return request(`/api/blocks/${id}`, { method: 'DELETE' });
}

/**
 * Uploads image bytes into an image block.
 * Precondition: the block is an image block; `file` is an image under 20 MB.
 * Postcondition: returns the block with its new resource; throws ApiError 415/413 for a bad file.
 */
export function uploadImage(blockId: string, file: File): Promise<Block> {
  return request(`/api/blocks/${blockId}/image`, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
}

/**
 * Saves a user-edited caption (D1).
 * Precondition: the resource exists.
 * Postcondition: the caption is stored with userEdited=true; returns the resource.
 */
export function patchCaption(resourceId: string, caption: { title: string; description: string }): Promise<Resource> {
  return request(`/api/resources/${resourceId}/caption`, json('PATCH', caption));
}

/**
 * Lists a project's saved styles.
 * Precondition: none.
 * Postcondition: returns the styles.
 */
export function listStyles(projectId: string): Promise<StyleArtifact[]> {
  return request(`/api/projects/${projectId}/styles`);
}

/**
 * Deletes a style.
 * Precondition: the style exists.
 * Postcondition: the style is gone server-side.
 */
export function deleteStyle(id: string): Promise<void> {
  return request(`/api/styles/${id}`, { method: 'DELETE' });
}

/**
 * Loads a board's chat history (user and assistant text only).
 * Precondition: the board exists.
 * Postcondition: returns messages oldest first.
 */
export function listMessages(boardId: string): Promise<{ role: 'user' | 'assistant'; text: string }[]> {
  return request(`/api/boards/${boardId}/messages`);
}

/**
 * Reads settings.
 * Precondition: none.
 * Postcondition: returns the current settings.
 */
export function getSettings(): Promise<Settings> {
  return request('/api/settings');
}

/**
 * Updates settings.
 * Precondition: `patch` is a valid SettingsPatch.
 * Postcondition: returns the merged settings.
 */
export function putSettings(patch: SettingsPatch): Promise<Settings> {
  return request('/api/settings', json('PUT', patch));
}
