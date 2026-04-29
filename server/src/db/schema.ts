import { db } from "./database.js";
import { DEFAULT_ADAPTIVE_LEARNING_SCORE } from "../lib/scheduler.js";

const MIGRATION_VERSION = 7;

function ensureAuthTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      auth_provider TEXT NOT NULL DEFAULT 'local',
      google_sub TEXT,
      email TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

function ensureGoogleAuthColumns() {
  const columns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;

  if (!columns.some((column) => column.name === "auth_provider")) {
    db.exec("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local';");
  }

  if (!columns.some((column) => column.name === "google_sub")) {
    db.exec("ALTER TABLE users ADD COLUMN google_sub TEXT;");
  }

  if (!columns.some((column) => column.name === "email")) {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT;");
  }

  db.prepare(
    `
      UPDATE users
      SET auth_provider = 'local'
      WHERE auth_provider IS NULL OR trim(auth_provider) = ''
    `
  ).run();

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique
    ON users (google_sub)
    WHERE google_sub IS NOT NULL;
  `);
}

function recreateFlashcardsTableIfNeeded() {
  const currentVersion = (db.pragma("user_version", { simple: true }) as number | undefined) ?? 0;
  if (currentVersion >= MIGRATION_VERSION) {
    return;
  }

  db.exec("DROP TABLE IF EXISTS flashcards;");

  db.exec(`
    CREATE TABLE flashcards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source_text TEXT NOT NULL,
      source_language TEXT NOT NULL,
      target_text TEXT NOT NULL,
      target_language TEXT NOT NULL,
      part_of_speech TEXT NOT NULL,
      noun_gender TEXT,
      image_prompt TEXT NOT NULL,
      image_data TEXT,
      weight REAL NOT NULL DEFAULT ${DEFAULT_ADAPTIVE_LEARNING_SCORE},
      review_count INTEGER NOT NULL DEFAULT 0,
      mistake_count INTEGER NOT NULL DEFAULT 0,
      consecutive_correct INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_reviewed_at TEXT,
      last_result TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(user_id, source_text, source_language, target_text, target_language),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.pragma(`user_version = ${MIGRATION_VERSION}`);
}

export function initializeSchema() {
  ensureAuthTables();
  ensureGoogleAuthColumns();
  recreateFlashcardsTableIfNeeded();
}
