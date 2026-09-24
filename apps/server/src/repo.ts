import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  Block, BlockPatch, NewBlock, type AspectRatio, type BlockStatus, type Board, type Caption, type NewBlockInput,
  type Project, type Resource, type Settings, type SettingsPatch, type StyleArtifact, type Viewport,
} from '@mixboard/shared';

type Row = Record<string, any>;

export class NotFoundError extends Error {
  /**
   * Builds the error for a missing record.
   * Precondition: `kind` names the record type and `id` the missing id.
   * Postcondition: the message is `<kind> <id> not found` and `name` is NotFoundError.
   */
  constructor(kind: string, id: string) {
    super(`${kind} ${id} not found`);
    this.name = 'NotFoundError';
  }
}

/**
 * Current time as an ISO string.
 * Precondition: none.
 * Postcondition: returns a UTC timestamp that sorts lexicographically by time.
 */
function now(): string {
  return new Date().toISOString();
}

/**
 * New 32-hex identifier, matching the shape of AI-created Mixboard block ids.
 * Precondition: none.
 * Postcondition: returns a unique 32-character lowercase hex string.
 */
function newId(): string {
  return randomUUID().replaceAll('-', '');
}

/**
 * Maps a resource row to the shared Resource type.
 * Precondition: `r` is a row from the `resources` table.
 * Postcondition: JSON columns are parsed; missing ones become null.
 */
function toResource(r: Row): Resource {
  return {
    id: r.id,
    blockId: r.block_id,
    kind: r.kind,
    mimeType: r.mime_type,
    caption: r.caption ? JSON.parse(r.caption) : null,
    content: r.content ? JSON.parse(r.content) : null,
  };
}

/**
 * Maps a block row plus its resources to the shared Block type.
 * Precondition: `r` is a row from `blocks`; `resources` belong to that block.
 * Postcondition: returns a Block with parsed rect.
 */
function toBlock(r: Row, resources: Resource[]): Block {
  return {
    id: r.id,
    projectId: r.project_id,
    boardId: r.board_id,
    type: r.type,
    name: r.name,
    rect: JSON.parse(r.rect),
    zIndex: r.z_index,
    prompt: r.prompt,
    aspectRatio: r.aspect_ratio as AspectRatio | null,
    status: r.status,
    resources,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const THUMBNAIL_SQL = `(SELECT r.id FROM resources r JOIN blocks b ON r.block_id = b.id
  WHERE b.project_id = p.id AND r.kind = 'image' ORDER BY r.rowid DESC LIMIT 1) AS thumbnail_resource_id`;

/**
 * Maps a project row (with computed thumbnail column) to the shared Project type.
 * Precondition: `r` came from a query that selected `THUMBNAIL_SQL`.
 * Postcondition: returns a Project.
 */
function toProject(r: Row): Project {
  return { id: r.id, title: r.title, thumbnailResourceId: r.thumbnail_resource_id ?? null, createdAt: r.created_at, updatedAt: r.updated_at };
}

export class Repo {
  /**
   * Creates a repository over an open database.
   * Precondition: `db` has the schema applied; `filesDir` is creatable.
   * Postcondition: `filesDir` exists.
   */
  constructor(private db: DatabaseSync, private filesDir: string, private defaults: Settings) {
    mkdirSync(filesDir, { recursive: true });
  }

  /**
   * Runs a SELECT expected to return one row.
   * Precondition: `sql` is a valid statement with `params.length` placeholders.
   * Postcondition: returns the row or undefined.
   */
  private one(sql: string, ...params: any[]): Row | undefined {
    return this.db.prepare(sql).get(...params) as Row | undefined;
  }

  /**
   * Runs a SELECT returning many rows.
   * Precondition: `sql` is a valid statement with `params.length` placeholders.
   * Postcondition: returns all rows (possibly empty).
   */
  private all(sql: string, ...params: any[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }

  /**
   * Runs a write statement.
   * Precondition: `sql` is a valid statement with `params.length` placeholders.
   * Postcondition: the statement was applied.
   */
  private run(sql: string, ...params: any[]): void {
    this.db.prepare(sql).run(...params);
  }

  // ---- projects and boards

  /**
   * Creates a project.
   * Precondition: none.
   * Postcondition: a new project row exists and is returned.
   */
  createProject(title = 'Untitled'): Project {
    const id = newId();
    const t = now();
    this.run('INSERT INTO projects (id,title,created_at,updated_at) VALUES (?,?,?,?)', id, title, t, t);
    return this.getProject(id);
  }

  /**
   * Loads a project.
   * Precondition: none.
   * Postcondition: returns the project; throws NotFoundError when absent.
   */
  getProject(id: string): Project {
    const r = this.one(`SELECT p.*, ${THUMBNAIL_SQL} FROM projects p WHERE p.id = ?`, id);
    if (!r) throw new NotFoundError('project', id);
    return toProject(r);
  }

  /**
   * Lists projects, most recently updated first.
   * Precondition: none.
   * Postcondition: returns all projects.
   */
  listProjects(): Project[] {
    return this.all(`SELECT p.*, ${THUMBNAIL_SQL} FROM projects p ORDER BY p.updated_at DESC`).map(toProject);
  }

  /**
   * Renames a project.
   * Precondition: the project exists.
   * Postcondition: the title and updated_at are changed; throws NotFoundError when absent.
   */
  updateProject(id: string, patch: { title: string }): Project {
    this.getProject(id);
    this.run('UPDATE projects SET title=?, updated_at=? WHERE id=?', patch.title, now(), id);
    return this.getProject(id);
  }

  /**
   * Creates a board in a project.
   * Precondition: the project exists.
   * Postcondition: a board with the default viewport exists and is returned; throws NotFoundError for an unknown project.
   */
  createBoard(projectId: string, title = 'Board 1'): Board {
    this.getProject(projectId);
    const id = newId();
    const t = now();
    this.run('INSERT INTO boards (id,project_id,title,viewport,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      id, projectId, title, JSON.stringify({ x: 0, y: 0, zoom: 1 }), t, t);
    return this.getBoard(id);
  }

  /**
   * Loads a board with its blocks ordered by z-index.
   * Precondition: none.
   * Postcondition: returns the board; throws NotFoundError when absent.
   */
  getBoard(id: string): Board {
    const r = this.one('SELECT * FROM boards WHERE id=?', id);
    if (!r) throw new NotFoundError('board', id);
    const blocks = this.all('SELECT * FROM blocks WHERE board_id=? ORDER BY z_index, rowid', id).map((b) => toBlock(b, this.resourcesFor(b.id)));
    return { id: r.id, projectId: r.project_id, title: r.title, viewport: JSON.parse(r.viewport), blocks, createdAt: r.created_at, updatedAt: r.updated_at };
  }

  /**
   * Lists a project's boards.
   * Precondition: none.
   * Postcondition: returns id/title pairs in creation order.
   */
  listBoards(projectId: string): { id: string; title: string }[] {
    return this.all('SELECT id,title FROM boards WHERE project_id=? ORDER BY created_at', projectId).map((r) => ({ id: r.id, title: r.title }));
  }

  /**
   * Updates a board's title and/or viewport.
   * Precondition: the board exists.
   * Postcondition: supplied fields are stored; throws NotFoundError when absent.
   */
  updateBoard(id: string, patch: { title?: string; viewport?: Viewport }): Board {
    const cur = this.getBoard(id);
    this.run('UPDATE boards SET title=?, viewport=?, updated_at=? WHERE id=?',
      patch.title ?? cur.title, JSON.stringify(patch.viewport ?? cur.viewport), now(), id);
    return this.getBoard(id);
  }

  // ---- blocks

  /**
   * Creates a block on a board.
   * Precondition: the board exists; `input` satisfies NewBlock.
   * Postcondition: the block exists with the next z-index unless one was given; throws NotFoundError or ZodError otherwise.
   */
  createBlock(boardId: string, input: NewBlockInput): Block {
    const b = NewBlock.parse(input);
    const board = this.getBoard(boardId);
    const id = newId();
    const t = now();
    const z = b.zIndex ?? (this.one('SELECT COALESCE(MAX(z_index),0)+1 AS z FROM blocks WHERE board_id=?', boardId)!.z as number);
    this.run('INSERT INTO blocks (id,project_id,board_id,type,name,rect,z_index,prompt,aspect_ratio,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      id, board.projectId, boardId, b.type, b.name, JSON.stringify(b.rect), z, b.prompt, b.aspectRatio, b.status, t, t);
    return this.getBlock(id);
  }

  /**
   * Loads a block with its resources.
   * Precondition: none.
   * Postcondition: returns the block; throws NotFoundError when absent.
   */
  getBlock(id: string): Block {
    const r = this.one('SELECT * FROM blocks WHERE id=?', id);
    if (!r) throw new NotFoundError('block', id);
    return toBlock(r, this.resourcesFor(id));
  }

  /**
   * Applies a partial patch (name, rect, zIndex) to a block.
   * Precondition: the block exists; `patch` satisfies BlockPatch.
   * Postcondition: only supplied fields change and updatedAt advances; throws NotFoundError or ZodError otherwise.
   */
  patchBlock(id: string, patch: unknown): Block {
    const cur = this.getBlock(id);
    const p = BlockPatch.parse(patch);
    this.run('UPDATE blocks SET name=?, rect=?, z_index=?, updated_at=? WHERE id=?',
      p.name ?? cur.name, JSON.stringify(p.rect ?? cur.rect), p.zIndex ?? cur.zIndex, now(), id);
    return this.getBlock(id);
  }

  /**
   * Sets a block's generation status.
   * Precondition: the block exists.
   * Postcondition: status is stored and the updated block returned.
   */
  setBlockStatus(id: string, status: BlockStatus): Block {
    this.getBlock(id);
    this.run('UPDATE blocks SET status=?, updated_at=? WHERE id=?', status, now(), id);
    return this.getBlock(id);
  }

  /**
   * Deletes a block, its resources and their files.
   * Precondition: the block exists.
   * Postcondition: no rows or files remain for the block; throws NotFoundError when absent.
   */
  deleteBlock(id: string): void {
    this.getBlock(id);
    this.clearResources(id);
    this.run('DELETE FROM blocks WHERE id=?', id);
  }

  // ---- resources

  /**
   * Lists a block's resources in creation order.
   * Precondition: none.
   * Postcondition: returns the resources (possibly empty).
   */
  private resourcesFor(blockId: string): Resource[] {
    return this.all('SELECT * FROM resources WHERE block_id=? ORDER BY rowid', blockId).map(toResource);
  }

  /**
   * Adds a resource to a block, writing bytes to disk when given.
   * Precondition: the block exists.
   * Postcondition: the resource row (and file, if `bytes`) exists; returns it.
   */
  addResource(input: { blockId: string; kind: 'image' | 'text'; mimeType: string; bytes?: Buffer; content?: unknown }): Resource {
    this.getBlock(input.blockId);
    const id = newId();
    if (input.bytes) writeFileSync(join(this.filesDir, id), input.bytes);
    this.run('INSERT INTO resources (id,block_id,kind,mime_type,has_file,content) VALUES (?,?,?,?,?,?)',
      id, input.blockId, input.kind, input.mimeType, input.bytes ? 1 : 0, input.content === undefined ? null : JSON.stringify(input.content));
    return this.getResource(id);
  }

  /**
   * Loads a resource.
   * Precondition: none.
   * Postcondition: returns it; throws NotFoundError when absent.
   */
  getResource(id: string): Resource {
    const r = this.one('SELECT * FROM resources WHERE id=?', id);
    if (!r) throw new NotFoundError('resource', id);
    return toResource(r);
  }

  /**
   * Locates a resource's stored file.
   * Precondition: none.
   * Postcondition: returns path and mime type, or null when the resource is unknown or has no file.
   */
  getResourceFile(id: string): { path: string; mimeType: string } | null {
    const r = this.one('SELECT mime_type, has_file FROM resources WHERE id=?', id);
    return r && r.has_file ? { path: join(this.filesDir, id), mimeType: r.mime_type } : null;
  }

  /**
   * Reads a resource's file into memory.
   * Precondition: none.
   * Postcondition: returns the bytes, or null when there is no file.
   */
  readResourceBytes(id: string): { bytes: Buffer; mimeType: string } | null {
    const f = this.getResourceFile(id);
    return f ? { bytes: readFileSync(f.path), mimeType: f.mimeType } : null;
  }

  /**
   * Removes all of a block's resources and files.
   * Precondition: none.
   * Postcondition: the block has no resources; files are deleted.
   */
  clearResources(blockId: string): void {
    for (const r of this.all('SELECT id FROM resources WHERE block_id=?', blockId)) rmSync(join(this.filesDir, r.id), { force: true });
    this.run('DELETE FROM resources WHERE block_id=?', blockId);
  }

  /**
   * Stores a caption. Machine captions never overwrite a user-edited one (D1).
   * Precondition: the resource exists.
   * Postcondition: with `byUser`, the caption is stored with userEdited=true; otherwise it is stored only when no user edit exists. Returns the resource.
   */
  setCaption(resourceId: string, caption: Pick<Caption, 'title' | 'description'>, byUser = false): Resource {
    const cur = this.getResource(resourceId);
    if (!byUser && cur.caption?.userEdited) return cur;
    this.run('UPDATE resources SET caption=? WHERE id=?', JSON.stringify({ ...caption, userEdited: byUser }), resourceId);
    return this.getResource(resourceId);
  }

  /**
   * Creates or replaces a text block's content.
   * Precondition: the block exists and is a text block.
   * Postcondition: the block has exactly one text resource holding `content`; returns it.
   */
  updateTextContent(blockId: string, content: unknown): Resource {
    const existing = this.one("SELECT id FROM resources WHERE block_id=? AND kind='text'", blockId);
    this.run('UPDATE blocks SET updated_at=? WHERE id=?', now(), blockId);
    if (!existing) return this.addResource({ blockId, kind: 'text', mimeType: 'text/plain', content });
    this.run('UPDATE resources SET content=? WHERE id=?', JSON.stringify(content), existing.id);
    return this.getResource(existing.id);
  }

  // ---- styles

  /**
   * Saves a style artifact.
   * Precondition: the project exists.
   * Postcondition: returns the new style without a preview.
   */
  saveStyle(input: { projectId: string; name: string; content: string }): StyleArtifact {
    this.getProject(input.projectId);
    const id = newId();
    this.run('INSERT INTO styles (id,project_id,name,content,created_at) VALUES (?,?,?,?,?)', id, input.projectId, input.name, input.content, now());
    return this.getStyle(id);
  }

  /**
   * Attaches a preview image to a style.
   * Precondition: the style exists.
   * Postcondition: the preview file and mime type are stored.
   */
  setStylePreview(id: string, bytes: Buffer, mimeType: string): void {
    this.getStyle(id);
    writeFileSync(join(this.filesDir, `style-${id}`), bytes);
    this.run('UPDATE styles SET preview_mime=? WHERE id=?', mimeType, id);
  }

  /**
   * Maps a style row to the shared type.
   * Precondition: `r` is a `styles` row.
   * Postcondition: returns a StyleArtifact.
   */
  private toStyle(r: Row): StyleArtifact {
    return { id: r.id, projectId: r.project_id, name: r.name, content: r.content, hasPreview: r.preview_mime != null, createdAt: r.created_at };
  }

  /**
   * Loads a style.
   * Precondition: none.
   * Postcondition: returns it; throws NotFoundError when absent.
   */
  getStyle(id: string): StyleArtifact {
    const r = this.one('SELECT * FROM styles WHERE id=?', id);
    if (!r) throw new NotFoundError('style', id);
    return this.toStyle(r);
  }

  /**
   * Lists a project's styles, oldest first.
   * Precondition: none.
   * Postcondition: returns the styles.
   */
  listStyles(projectId: string): StyleArtifact[] {
    return this.all('SELECT * FROM styles WHERE project_id=? ORDER BY created_at', projectId).map((r) => this.toStyle(r));
  }

  /**
   * Locates a style's preview file.
   * Precondition: none.
   * Postcondition: returns path and mime type, or null when there is no preview.
   */
  getStylePreviewFile(id: string): { path: string; mimeType: string } | null {
    const r = this.one('SELECT preview_mime FROM styles WHERE id=?', id);
    return r?.preview_mime ? { path: join(this.filesDir, `style-${id}`), mimeType: r.preview_mime } : null;
  }

  /**
   * Deletes a style and its preview file.
   * Precondition: the style exists.
   * Postcondition: the row and file are gone; throws NotFoundError when absent.
   */
  deleteStyle(id: string): void {
    this.getStyle(id);
    rmSync(join(this.filesDir, `style-${id}`), { force: true });
    this.run('DELETE FROM styles WHERE id=?', id);
  }

  // ---- messages and settings

  /**
   * Appends raw chat messages (OpenRouter format) to a board's history.
   * Precondition: `messages` are JSON-serializable.
   * Postcondition: they are stored after existing messages, in order.
   */
  appendMessages(boardId: string, messages: unknown[]): void {
    for (const m of messages) this.run('INSERT INTO messages (board_id,json) VALUES (?,?)', boardId, JSON.stringify(m));
  }

  /**
   * Lists a board's stored messages.
   * Precondition: none.
   * Postcondition: returns them oldest first.
   */
  listMessages(boardId: string): unknown[] {
    return this.all('SELECT json FROM messages WHERE board_id=? ORDER BY id', boardId).map((r) => JSON.parse(r.json));
  }

  /**
   * Reads settings, filling gaps from the defaults.
   * Precondition: none.
   * Postcondition: returns a complete Settings object.
   */
  getSettings(): Settings {
    const r = this.one("SELECT value FROM settings WHERE key='settings'");
    const stored = r ? (JSON.parse(r.value) as Partial<Settings>) : {};
    return { puns: stored.puns ?? this.defaults.puns, models: { ...this.defaults.models, ...stored.models } };
  }

  /**
   * Merges a patch into the stored overrides, so unset keys keep following the config defaults.
   * Precondition: `patch` satisfies SettingsPatch.
   * Postcondition: only user-set keys are persisted; the resolved settings are returned.
   */
  updateSettings(patch: SettingsPatch): Settings {
    const r = this.one("SELECT value FROM settings WHERE key='settings'");
    const stored = r ? (JSON.parse(r.value) as SettingsPatch) : {};
    const next: SettingsPatch = { ...stored, ...(patch.puns !== undefined && { puns: patch.puns }) };
    if (stored.models || patch.models) next.models = { ...stored.models, ...patch.models };
    this.run("INSERT INTO settings (key,value) VALUES ('settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(next));
    return this.getSettings();
  }
}
