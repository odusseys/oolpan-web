import { randomBytes } from "node:crypto";
import type { AuthProvider, User } from "@study/shared";
import { db } from "./database.js";

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  auth_provider: AuthProvider;
  google_sub: string | null;
  email: string | null;
  created_at: string;
};

type StoredUser = {
  user: User;
  passwordHash: string;
  googleSub: string | null;
};

function mapUser(row: Pick<UserRow, "id" | "username" | "auth_provider" | "email" | "created_at">): User {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
    authProvider: row.auth_provider,
    email: row.email
  };
}

function mapStoredUser(row: UserRow): StoredUser {
  return {
    user: mapUser(row),
    passwordHash: row.password_hash,
    googleSub: row.google_sub
  };
}

export function getUserById(id: number) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? mapStoredUser(row) : null;
}

export function getUserByUsername(username: string) {
  const row = db
    .prepare("SELECT * FROM users WHERE lower(username) = lower(?)")
    .get(username.trim()) as UserRow | undefined;

  return row ? mapStoredUser(row) : null;
}

export function getUserByGoogleSub(googleSub: string) {
  const row = db.prepare("SELECT * FROM users WHERE google_sub = ?").get(googleSub) as UserRow | undefined;
  return row ? mapStoredUser(row) : null;
}

export function createUser(options: {
  username: string;
  passwordHash: string;
  authProvider?: AuthProvider;
  googleSub?: string | null;
  email?: string | null;
}) {
  const now = new Date().toISOString();
  const authProvider = options.authProvider ?? "local";
  const info = db
    .prepare(
      `
        INSERT INTO users (username, password_hash, auth_provider, google_sub, email, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      options.username.trim(),
      options.passwordHash,
      authProvider,
      options.googleSub ?? null,
      options.email ?? null,
      now
    );

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
        SELECT users.id, users.username, users.auth_provider, users.email, users.created_at
        FROM user_sessions
        JOIN users ON users.id = user_sessions.user_id
        WHERE user_sessions.token = ?
      `
    )
    .get(token) as Pick<UserRow, "id" | "username" | "auth_provider" | "email" | "created_at"> | undefined;

  return row ? mapUser(row) : null;
}

export function deleteSession(token: string) {
  db.prepare("DELETE FROM user_sessions WHERE token = ?").run(token);
}
