import { createSession, createUser, deleteSession, getSessionUser, getUserByUsername } from "../db/authRepository.js";
import { generateDefaultPassword, hashPassword, verifyPassword } from "../lib/passwords.js";

export function registerUser(username: string) {
  const existing = getUserByUsername(username);
  if (existing) {
    throw new Error("That username is already taken");
  }

  const defaultPassword = generateDefaultPassword();
  const created = createUser(username, hashPassword(defaultPassword));
  if (!created) {
    throw new Error("Could not create user");
  }

  const sessionToken = createSession(created.user.id);

  return {
    user: created.user,
    sessionToken,
    defaultPassword
  };
}

export function loginUser(username: string, password: string) {
  const existing = getUserByUsername(username);
  if (!existing || !verifyPassword(password, existing.passwordHash)) {
    throw new Error("Invalid username or password");
  }

  const sessionToken = createSession(existing.user.id);

  return {
    user: existing.user,
    sessionToken
  };
}

export function getUserFromSessionToken(token: string) {
  return getSessionUser(token);
}

export function logoutSession(token: string) {
  deleteSession(token);
}
