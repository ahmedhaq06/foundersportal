import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'portal.db');

let dbInstance = null;

export function getDb() {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Managing Partner',
      avatar_initials TEXT NOT NULL,
      accent_color TEXT NOT NULL DEFAULT '#D4AF37',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_title TEXT NOT NULL,
      client_name TEXT NOT NULL,
      client_email TEXT NOT NULL,
      client_company TEXT NOT NULL DEFAULT '',
      value REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      closed_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Closed Won',
      owner_id INTEGER NOT NULL REFERENCES users(id),
      split_percent INTEGER NOT NULL DEFAULT 50,
      commission_percent REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL REFERENCES users(id),
      category TEXT NOT NULL DEFAULT 'progress',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fx_rates (
      currency TEXT PRIMARY KEY,
      rate_to_usd REAL NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const dealCols = db.prepare('PRAGMA table_info(deals)').all();
  if (!dealCols.some((c) => c.name === 'commission_percent')) {
    db.exec(
      'ALTER TABLE deals ADD COLUMN commission_percent REAL NOT NULL DEFAULT 0;'
    );
  }

  seedIfEmpty(db);
  dbInstance = db;
  return db;
}

function seedIfEmpty(db) {
  const fxCount = db.prepare('SELECT COUNT(*) AS c FROM fx_rates').get().c;
  if (fxCount === 0) {
    const insertFx = db.prepare(
      'INSERT INTO fx_rates (currency, rate_to_usd) VALUES (?, ?)'
    );
    insertFx.run('USD', 1.0);
    insertFx.run('EUR', 1.08);
    insertFx.run('GBP', 1.27);
    insertFx.run('INR', 0.0119);
  }

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0) return;

  const defaultPassHash = hashPassword('portal2026');
  const insertUser = db.prepare(
    `INSERT INTO users (username, name, email, password_hash, role, avatar_initials, accent_color)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  insertUser.run(
    'ahmed',
    'Ahmed',
    'ahmed@ahmedafeef.co',
    defaultPassHash,
    'Founder',
    'AH',
    '#D4AF37'
  );
  insertUser.run(
    'afeef',
    'Afeef',
    'afeef@ahmedafeef.co',
    defaultPassHash,
    'Founder',
    'AF',
    '#94A3B8'
  );
}
