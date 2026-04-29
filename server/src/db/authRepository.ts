import { randomBytes } from "node:crypto";
import type { User } from "@study/shared";
import { db } from "./database.js";

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
};

function mapUser(row: Pick<UserRow, "id" | "username" | "created_at">): User {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at
  };
}

export function getUserById(id: number) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row
    ? {
        user: mapUser(row),
        passwordHash: row.password_hash
      }
    : null;
}

export function getUserByUsername(username: string) {
  const row = db
    .prepare("SELECT * FROM users WHERE lower(username) = lower(?)")
    .get(username.trim()) as UserRow | undefined;

  return row
    ? {
        user: mapUser(row),
        passwordHash: row.password_hash
      }
    : null;
}

export function createUser(username: string, passwordHash: string) {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
        INSERT INTO users (username, password_hash, created_at)
        VALUES (?, ?, ?)
      `
    )
    .run(username.trim(), passwordHash, now);

  return getUserById(Number(info.lastInsertRowid));
}

export function createSession(userId: number) {
  const token = randomBytes(24).toString("hex");
  const now = new Date().toISOString();

  db.prepare(
    `
      INSERT INTO user_sessions (token, user_id, created_at)
      VALUES (?, ?, ?)
    `
  ).run(token, userId, now);

  return token;
}

export function getSessionUser(token: string) {
  const row = db
    .prepare(
      `
        SELECT users.id, users.username, users.created_at
        FROM user_sessions
        JOIN users ON users.id = user_sessions.user_id
        WHERE user_sessions.token = ?
      `
    )
    .get(token) as Pick<UserRow, "id" | "username" | "created_at"> | undefined;

  return row ? mapUser(row) : null;
}

export function deleteSession(token: string) {
  db.prepare("DELETE FROM user_sessions WHERE token = ?").run(token);
}
