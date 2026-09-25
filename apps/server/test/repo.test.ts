import { existsSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db';
import { NotFoundError, Repo } from '../src/repo';
import { defaultSettings, makeRepo } from './helpers';

const rect = { x: 0, y: 0, w: 100, h: 50 };

describe('Repo', () => {
  it('creates blocks with increasing z-index and lists them in order', () => {
    const { repo } = makeRepo();
    const board = repo.createBoard(repo.createProject('Trip').id);
    const a = repo.createBlock(board.id, { type: 'text', rect });
    const b = repo.createBlock(board.id, { type: 'text', rect });
    expect(a.zIndex).toBeLessThan(b.zIndex);
    expect(repo.getBoard(board.id).blocks.map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it('patches only the supplied fields and bumps updatedAt', async () => {
    const { repo } = makeRepo();
    const board = repo.createBoard(repo.createProject().id);
    const a = repo.createBlock(board.id, { type: 'text', rect, name: 'keep' });
    await new Promise((r) => setTimeout(r, 5));
    const p = repo.patchBlock(a.id, { rect: { x: 5, y: 5, w: 10, h: 10 } });
    expect(p.name).toBe('keep');
    expect(p.rect.x).toBe(5);
    expect(p.updatedAt > a.updatedAt).toBe(true);
  });

  it('throws NotFoundError for unknown blocks', () => {
    const { repo } = makeRepo();
    expect(() => repo.patchBlock('nope', { name: 'x' })).toThrow(NotFoundError);
    expect(() => repo.deleteBlock('nope')).toThrow(NotFoundError);
  });

  it('deletes a block with its resources and files', () => {
    const { repo } = makeRepo();
    const board = repo.createBoard(repo.createProject().id);
    const blk = repo.createBlock(board.id, { type: 'image', rect });
    const r = repo.addResource({ blockId: blk.id, kind: 'image', mimeType: 'image/png', bytes: Buffer.from([1, 2]) });
    const file = repo.getResourceFile(r.id)!;
    expect(existsSync(file.path)).toBe(true);
    repo.deleteBlock(blk.id);
    expect(repo.getResourceFile(r.id)).toBeNull();
    expect(existsSync(file.path)).toBe(false);
  });

  it('never lets a regenerated caption overwrite a user edit', () => {
    const { repo } = makeRepo();
    const board = repo.createBoard(repo.createProject().id);
    const blk = repo.createBlock(board.id, { type: 'image', rect });
    const r = repo.addResource({ blockId: blk.id, kind: 'image', mimeType: 'image/png', bytes: Buffer.from([1]) });
    repo.setCaption(r.id, { title: 'A', description: 'd' });
    repo.setCaption(r.id, { title: 'Mine', description: 'x' }, true);
    const after = repo.setCaption(r.id, { title: 'Regen', description: 'y' });
    expect(after.caption).toEqual({ title: 'Mine', description: 'x', userEdited: true });
  });

  it('upserts text content and reports a project thumbnail', () => {
    const { repo } = makeRepo();
    const project = repo.createProject();
    const board = repo.createBoard(project.id);
    const t = repo.createBlock(board.id, { type: 'text', rect });
    repo.updateTextContent(t.id, { richText: { type: 'doc' }, scale: 1, autoSize: false });
    repo.updateTextContent(t.id, { richText: { type: 'doc', content: [] }, scale: 1, autoSize: false });
    expect(repo.getBlock(t.id).resources).toHaveLength(1);
    expect(repo.getProject(project.id).thumbnailResourceId).toBeNull();
    const img = repo.createBlock(board.id, { type: 'image', rect });
    const r = repo.addResource({ blockId: img.id, kind: 'image', mimeType: 'image/png', bytes: Buffer.from([1]) });
    expect(repo.getProject(project.id).thumbnailResourceId).toBe(r.id);
  });

  it('saves, lists and deletes styles with previews', () => {
    const { repo } = makeRepo();
    const project = repo.createProject();
    const s = repo.saveStyle({ projectId: project.id, name: 'Oil', content: '**Mood**: warm' });
    expect(s.hasPreview).toBe(false);
    repo.setStylePreview(s.id, Buffer.from([9]), 'image/png');
    expect(repo.listStyles(project.id)[0].hasPreview).toBe(true);
    expect(repo.getStylePreviewFile(s.id)?.mimeType).toBe('image/png');
    repo.deleteStyle(s.id);
    expect(repo.listStyles(project.id)).toEqual([]);
  });

  it('stores messages per board and settings with defaults', () => {
    const { repo } = makeRepo();
    const board = repo.createBoard(repo.createProject().id);
    repo.appendMessages(board.id, [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }]);
    expect(repo.listMessages(board.id)).toEqual([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }]);
    expect(repo.getSettings()).toEqual(defaultSettings);
    const s = repo.updateSettings({ puns: true, models: { image: 'x/y' } });
    expect(s.puns).toBe(true);
    expect(s.models).toEqual({ ...defaultSettings.models, image: 'x/y' });
    expect(repo.getSettings()).toEqual(s);
  });
  it('crops regenerated images by default and remembers when that is switched off', () => {
    const { repo } = makeRepo();
    expect(repo.getSettings().cropRegenerated).toBe(true);
    repo.updateSettings({ cropRegenerated: false });
    repo.updateSettings({ puns: true });
    expect(repo.getSettings()).toMatchObject({ cropRegenerated: false, puns: true });
  });
  it('hides lineage arrows and fades them by default, and remembers changes', () => {
    const { repo } = makeRepo();
    expect(repo.getSettings()).toMatchObject({ showLineage: false, lineageFade: true });
    repo.updateSettings({ showLineage: true });
    repo.updateSettings({ lineageFade: false });
    expect(repo.getSettings()).toMatchObject({ showLineage: true, lineageFade: false, cropRegenerated: true });
  });
  it('stores where a block came from, and null for blocks made from nothing', () => {
    const { repo } = makeRepo();
    const board = repo.createBoard(repo.createProject().id);
    const plain = repo.createBlock(board.id, { type: 'image', rect });
    const derived = repo.createBlock(board.id, { type: 'image', rect, origin: { action: 'regenerate', sourceBlockIds: [plain.id] } });
    expect(plain.origin).toBeNull();
    expect(repo.getBlock(derived.id).origin).toEqual({ action: 'regenerate', sourceBlockIds: [plain.id] });
  });
  it('adds the origin column to a database created before lineage existed', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'mb-old-')), 'old.sqlite');
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE boards (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, viewport TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE blocks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, board_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, rect TEXT NOT NULL, z_index INTEGER NOT NULL, prompt TEXT, aspect_ratio TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO projects VALUES ('p', 'Old', 't', 't');
      INSERT INTO boards VALUES ('bd', 'p', 'Board', '{"x":0,"y":0,"zoom":1}', 't', 't');
      INSERT INTO blocks VALUES ('b', 'p', 'bd', 'image', 'Old image', '{"x":0,"y":0,"w":1,"h":1}', 1, NULL, NULL, 'ready', 't', 't');`);
    old.close();
    const repo = new Repo(openDb(path), join(tmpdir(), 'mb-old-files'), defaultSettings);
    expect(repo.getBlock('b')).toMatchObject({ name: 'Old image', origin: null });
    openDb(path); // Opening again must not try to add the column twice.
  });
  it('stores a block prompt', () => {
    const { repo } = makeRepo();
    const board = repo.createBoard(repo.createProject().id);
    const block = repo.createBlock(board.id, { type: 'image', rect: { x: 0, y: 0, w: 10, h: 10 } });
    expect(repo.setBlockPrompt(block.id, 'a mandrill portrait').prompt).toBe('a mandrill portrait');
  });
});

describe('review fixes', () => {
  it('keeps unset model ids following the defaults after a puns-only save', () => {
    const { repo } = makeRepo();
    repo.updateSettings({ puns: true });
    const other = new Repo((repo as any).db, (repo as any).filesDir, {
      ...defaultSettings,
      models: { ...defaultSettings.models, image: 'new/image' },
    });
    expect(other.getSettings().models.image).toBe('new/image');
    expect(other.getSettings().puns).toBe(true);
  });
});
