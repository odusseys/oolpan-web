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

type SessionUserRow = Pick<UserRow, "id" | "username" | "auth_provider" | "email" | "created_at">;

type StoredUser = {
  user: User;
  passwordHash: string;
  googleSub: string | null;
};

function mapUser(row: SessionUserRow): User {
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

export async function getUserById(id: number) {
  const rows = await db<UserRow[]>`
    SELECT * FROM users WHERE id = ${id} LIMIT 1
  `;
  const row = rows[0];
  return row ? mapStoredUser(row) : null;
}

export async function getUserByUsername(username: string) {
  const rows = await db<UserRow[]>`
    SELECT * FROM users
    WHERE LOWER(username) = LOWER(${username.trim()})
    LIMIT 1
  `;
  const row = rows[0];
  return row ? mapStoredUser(row) : null;
}

export async function getUserByGoogleSub(googleSub: string) {
  const rows = await db<UserRow[]>`
    SELECT * FROM users
    WHERE google_sub = ${googleSub}
    LIMIT 1
  `;
  const row = rows[0];
  return row ? mapStoredUser(row) : null;
}

export async function createUser(options: {
  username: string;
  passwordHash: string;
  authProvider?: AuthProvider;
  googleSub?: string | null;
  email?: string | null;
}) {
  const now = new Date().toISOString();
  const authProvider = options.authProvider ?? "local";

  const rows = await db<UserRow[]>`
    INSERT INTO users (username, password_hash, auth_provider, google_sub, email, created_at)
    VALUES (
      ${options.username.trim()},
      ${options.passwordHash},
      ${authProvider},
      ${options.googleSub ?? null},
      ${options.email ?? null},
      ${now}
    )
    RETURNING *
  `;

  const row = rows[0];
  return row ? mapStoredUser(row) : null;
}

export async function createSession(userId: number) {
  const token = randomBytes(24).toString("hex");
  const now = new Date().toISOString();

  await db`
    INSERT INTO user_sessions (token, user_id, created_at)
    VALUES (${token}, ${userId}, ${now})
  `;

  return token;
}

export async function getSessionUser(token: string) {
  const rows = await db<SessionUserRow[]>`
    SELECT users.id, users.username, users.auth_provider, users.email, users.created_at
    FROM user_sessions
    JOIN users ON users.id = user_sessions.user_id
    WHERE user_sessions.token = ${token}
    LIMIT 1
  `;

  const row = rows[0];
  return row ? mapUser(row) : null;
}

export async function deleteSession(token: string) {
  await db`
    DELETE FROM user_sessions WHERE token = ${token}
  `;
}
