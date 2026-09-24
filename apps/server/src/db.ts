import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';

const nodeRequire = createRequire(import.meta.url);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, viewport TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS blocks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, type TEXT NOT NULL, name TEXT NOT NULL, rect TEXT NOT NULL, z_index INTEGER NOT NULL, prompt TEXT, aspect_ratio TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE, kind TEXT NOT NULL, mime_type TEXT NOT NULL, has_file INTEGER NOT NULL DEFAULT 0, content TEXT, caption TEXT);
CREATE TABLE IF NOT EXISTS styles (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, content TEXT NOT NULL, preview_mime TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, board_id TEXT NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/**
 * Opens (creating if needed) the SQLite database and applies the schema.
 * Precondition: `path` is `:memory:` or a writable file path whose directory exists.
 * Postcondition: returns an open handle with foreign keys enabled and all tables present.
 * `node:sqlite` is loaded through createRequire so bundlers and test runners cannot mangle the `node:` prefix.
 */
export function openDb(path: string): DatabaseSync {
  const { DatabaseSync: Db } = nodeRequire('node:sqlite') as typeof import('node:sqlite');
  const db = new Db(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}
