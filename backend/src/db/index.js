import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

// Uses Node's built-in `node:sqlite` (stable enough for this prototype,
// still flagged "experimental" by Node itself) instead of a native addon
// like better-sqlite3 - this environment has no Windows C++ build tools
// available to compile one, and node:sqlite needs zero compilation at all.
// The API surface used throughout this codebase (prepare/run/get/all,
// lastInsertRowid, changes, RETURNING, json_each) is compatible with
// better-sqlite3, so migrating to that (or to `pg`) later only touches this
// file and db/migrate.js/db/seed.js's transaction wrapper.
const dbFile = process.env.DATABASE_FILE || './data/sih.db';
const dbDir = path.dirname(dbFile);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

export const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/** Runs fn() inside a transaction, rolling back if it throws. */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export default db;
