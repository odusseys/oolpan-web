import { Router, type Request } from "express";
import { z } from "zod";
import {
  createFlashcardRequestSchema,
  googleAuthRequestSchema,
  loginRequestSchema,
  registerUserRequestSchema,
  reviewRequestSchema,
  speechRequestSchema,
  translationRequestSchema
} from "./schemas.js";
import {
  createFlashcardWithImage,
  generateSpeech,
  getAiMode,
  getNextStudyCard,
  removeFlashcard,
  suggestFlashcards,
  getStudyStats,
  reviewCard,
  translatePhrase
} from "../services/flashcardService.js";
import {
  getGoogleAuthConfig,
  getUserFromSessionToken,
  loginUser,
  loginWithGoogle,
  logoutSession,
  registerUser
} from "../services/authService.js";

export const apiRouter = Router();

function getRequestUser(req: Request) {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : null;

  if (!token) {
    return { token: null, user: null };
  }

  return {
    token,
    user: getUserFromSessionToken(token)
  };
}

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, aiMode: getAiMode() });
});

apiRouter.post("/auth/register", (req, res, next) => {
  try {
    const payload = registerUserRequestSchema.parse(req.body);
    res.status(201).json(registerUser(payload.username));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/auth/login", (req, res, next) => {
  try {
    const payload = loginRequestSchema.parse(req.body);
    res.json(loginUser(payload.username, payload.password));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/auth/google/config", (_req, res) => {
  res.json(getGoogleAuthConfig());
});

apiRouter.post("/auth/google", async (req, res, next) => {
  try {
    const payload = googleAuthRequestSchema.parse(req.body);
    res.json(await loginWithGoogle(payload.credential));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/auth/me", (req, res) => {
  const { user } = getRequestUser(req);
  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  res.json({ user });
});

apiRouter.post("/auth/logout", (req, res) => {
  const { token } = getRequestUser(req);
  if (token) {
    logoutSession(token);
  }

  res.status(204).end();
});

apiRouter.get("/stats", (req, res) => {
  const { user } = getRequestUser(req);
  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  res.json(getStudyStats(user.id));
});

apiRouter.get("/flashcards/next", (req, res) => {
  const { user } = getRequestUser(req);
  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  res.json(getNextStudyCard(user.id));
});

apiRouter.get("/suggestions", async (req, res, next) => {
  try {
    const { user } = getRequestUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const sourceLanguage = z.enum(["en", "he"]).parse(req.query.sourceLanguage);
    const targetLanguage = z.enum(["en", "he"]).parse(req.query.targetLanguage);
    const seed = z.string().optional().parse(req.query.seed);
    res.json(await suggestFlashcards(user.id, sourceLanguage, targetLanguage, seed));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/translate", async (req, res, next) => {
  try {
    const { user } = getRequestUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const payload = translationRequestSchema.parse(req.body);
    const result = await translatePhrase(payload);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/audio/speech", async (req, res, next) => {
  try {
    const { user } = getRequestUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const payload = speechRequestSchema.parse(req.body);
    res.json(await generateSpeech(payload));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/flashcards", async (req, res, next) => {
  try {
    const { user } = getRequestUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const payload = createFlashcardRequestSchema.parse(req.body);
    const result = await createFlashcardWithImage(user.id, payload);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/flashcards/:id/review", (req, res, next) => {
  try {
    const { user } = getRequestUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const cardId = z.coerce.number().int().positive().parse(req.params.id);
    const payload = reviewRequestSchema.parse(req.body);
    res.json(reviewCard(user.id, cardId, payload));
  } catch (error) {
    next(error);
  }
});

apiRouter.delete("/flashcards/:id", (req, res, next) => {
  try {
    const { user } = getRequestUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const cardId = z.coerce.number().int().positive().parse(req.params.id);
    res.json(removeFlashcard(user.id, cardId));
  } catch (error) {
    next(error);
  }
});
