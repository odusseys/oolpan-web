import { OAuth2Client } from "google-auth-library";
import { createSession, createUser, deleteSession, getSessionUser, getUserByGoogleSub, getUserByUsername } from "../db/authRepository.js";
import { appConfig } from "../config.js";
import { generateDefaultPassword, hashPassword, verifyPassword } from "../lib/passwords.js";

const GOOGLE_USERNAME_MAX_LENGTH = 32;
const googleClient = appConfig.googleClientId ? new OAuth2Client(appConfig.googleClientId) : null;

function normalizeGoogleUsername(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  return normalized.slice(0, GOOGLE_USERNAME_MAX_LENGTH);
}

function buildGoogleUsername(name: string | null | undefined, email: string | null | undefined) {
  const preferred = normalizeGoogleUsername(name ?? "");
  if (preferred) {
    return preferred;
  }

  const emailLocalPart = email ? normalizeGoogleUsername(email.split("@")[0] ?? "") : "";
  if (emailLocalPart) {
    return emailLocalPart;
  }

  return "google-user";
}

async function makeAvailableGoogleUsername(name: string | null | undefined, email: string | null | undefined) {
  const baseUsername = buildGoogleUsername(name, email);
  let candidate = baseUsername;
  let suffix = 2;

  while (await getUserByUsername(candidate)) {
    const suffixText = `-${suffix}`;
    const stem = baseUsername.slice(0, Math.max(1, GOOGLE_USERNAME_MAX_LENGTH - suffixText.length));
    candidate = `${stem}${suffixText}`;
    suffix += 1;
  }

  return candidate;
}

export async function registerUser(username: string) {
  const existing = await getUserByUsername(username);
  if (existing) {
    throw new Error("That username is already taken");
  }

  const defaultPassword = generateDefaultPassword();
  const created = await createUser({
    username,
    passwordHash: hashPassword(defaultPassword),
    authProvider: "local"
  });
  if (!created) {
    throw new Error("Could not create user");
  }

  const sessionToken = await createSession(created.user.id);

  return {
    user: created.user,
    sessionToken,
    defaultPassword
  };
}

export async function loginUser(username: string, password: string) {
  const existing = await getUserByUsername(username);
  if (!existing) {
    throw new Error("Invalid username or password");
  }

  if (existing.user.authProvider === "google") {
    throw new Error("This account uses Google sign-in");
  }

  if (!verifyPassword(password, existing.passwordHash)) {
    throw new Error("Invalid username or password");
  }

  const sessionToken = await createSession(existing.user.id);

  return {
    user: existing.user,
    sessionToken
  };
}

export async function getUserFromSessionToken(token: string) {
  return getSessionUser(token);
}

export async function logoutSession(token: string) {
  await deleteSession(token);
}

export function getGoogleAuthConfig() {
  return {
    enabled: Boolean(appConfig.googleClientId),
    clientId: appConfig.googleClientId ?? null
  };
}

export async function loginWithGoogle(credential: string) {
  if (!googleClient || !appConfig.googleClientId) {
    throw new Error("Google sign-in is not configured");
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: appConfig.googleClientId
  });
  const payload = ticket.getPayload();

  if (!payload?.sub) {
    throw new Error("Google sign-in could not be verified");
  }

  if (payload.email && payload.email_verified === false) {
    throw new Error("Your Google email address is not verified");
  }

  const existing = await getUserByGoogleSub(payload.sub);
  if (existing) {
    const sessionToken = await createSession(existing.user.id);
    return {
      user: existing.user,
      sessionToken
    };
  }

  const created = await createUser({
    username: await makeAvailableGoogleUsername(payload.name, payload.email),
    passwordHash: "",
    authProvider: "google",
    googleSub: payload.sub,
    email: payload.email ?? null
  });

  if (!created) {
    throw new Error("Could not create Google account");
  }

  const sessionToken = await createSession(created.user.id);
  return {
    user: created.user,
    sessionToken
  };
}
