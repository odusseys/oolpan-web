import { db } from "./database.js";
import { DEFAULT_ADAPTIVE_LEARNING_SCORE } from "../lib/scheduler.js";
import { hashPassword } from "../lib/passwords.js";

const LEGACY_MIN_WEIGHT = 0.35;
const LEGACY_MAX_WEIGHT = 12;
const MIGRATION_VERSION = 4;
const LEGACY_USERNAME = "local";
const LEGACY_PASSWORD = "oolpan-local";

function ensureActiveColumn() {
  const columns = db.prepare("PRAGMA table_info(flashcards)").all() as Array<{ name: string }>;
  const hasActiveColumn = columns.some((column) => column.name === "is_active");

  if (!hasActiveColumn) {
    db.exec("ALTER TABLE flashcards ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;");
  }
}

function ensureAuthTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
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

function ensureLegacyUser() {
  const existing = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(LEGACY_USERNAME) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
        INSERT INTO users (username, password_hash, created_at)
        VALUES (?, ?, ?)
      `
    )
    .run(LEGACY_USERNAME, hashPassword(LEGACY_PASSWORD), now);

  return Number(info.lastInsertRowid);
}

function migrateFlashcardsToUserScopedDecks() {
  const columns = db.prepare("PRAGMA table_info(flashcards)").all() as Array<{ name: string }>;
  const hasUserId = columns.some((column) => column.name === "user_id");

  if (hasUserId) {
    return;
  }

  const legacyUserId = ensureLegacyUser();

  db.exec(`
    CREATE TABLE flashcards_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source_text TEXT NOT NULL,
      source_language TEXT NOT NULL,
      target_text TEXT NOT NULL,
      target_language TEXT NOT NULL,
      part_of_speech TEXT NOT NULL,
      noun_gender TEXT,
      image_prompt TEXT NOT NULL,
      image_path TEXT,
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

  db.prepare(
    `
      INSERT INTO flashcards_next (
        id,
        user_id,
        source_text,
        source_language,
        target_text,
        target_language,
        part_of_speech,
        noun_gender,
        image_prompt,
        image_path,
        weight,
        review_count,
        mistake_count,
        consecutive_correct,
        created_at,
        updated_at,
        last_reviewed_at,
        last_result,
        is_active
      )
      SELECT
        id,
        ?,
        source_text,
        source_language,
        target_text,
        target_language,
        part_of_speech,
        noun_gender,
        image_prompt,
        image_path,
        weight,
        review_count,
        mistake_count,
        consecutive_correct,
        created_at,
        updated_at,
        last_reviewed_at,
        last_result,
        is_active
      FROM flashcards
    `
  ).run(legacyUserId);

  db.exec(`
    DROP TABLE flashcards;
    ALTER TABLE flashcards_next RENAME TO flashcards;
  `);
}

function migrateLegacyWeightsToScores() {
  const currentVersion = (db.pragma("user_version", { simple: true }) as number | undefined) ?? 0;
  if (currentVersion >= MIGRATION_VERSION) {
    return;
  }

  const range = LEGACY_MAX_WEIGHT - LEGACY_MIN_WEIGHT;
  db.prepare(
    `
      UPDATE flashcards
      SET weight = CASE
        WHEN weight <= ? THEN 0.98
        WHEN weight >= ? THEN 0.02
        ELSE MAX(0.02, MIN(0.98, 1 - ((weight - ?) / ?)))
      END
    `
  ).run(LEGACY_MIN_WEIGHT, LEGACY_MAX_WEIGHT, LEGACY_MIN_WEIGHT, range);

  db.pragma(`user_version = ${MIGRATION_VERSION}`);
}

export function initializeSchema() {
  ensureAuthTables();

  db.exec(`
    CREATE TABLE IF NOT EXISTS flashcards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source_text TEXT NOT NULL,
      source_language TEXT NOT NULL,
      target_text TEXT NOT NULL,
      target_language TEXT NOT NULL,
      part_of_speech TEXT NOT NULL,
      noun_gender TEXT,
      image_prompt TEXT NOT NULL,
      image_path TEXT,
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

  migrateFlashcardsToUserScopedDecks();
  ensureActiveColumn();
  migrateLegacyWeightsToScores();
}
