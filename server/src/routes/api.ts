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

async function getRequestUser(req: Request) {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : null;

  if (!token) {
    return { token: null, user: null };
  }

  return {
    token,
    user: await getUserFromSessionToken(token)
  };
}

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, aiMode: getAiMode() });
});

apiRouter.post("/auth/register", (req, res, next) => {
  void (async () => {
    const payload = registerUserRequestSchema.parse(req.body);
    res.status(201).json(await registerUser(payload.username));
  })().catch((error) => {
    next(error);
  });
});

apiRouter.post("/auth/login", (req, res, next) => {
  void (async () => {
    const payload = loginRequestSchema.parse(req.body);
    res.json(await loginUser(payload.username, payload.password));
  })().catch((error) => {
    next(error);
  });
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

apiRouter.get("/auth/me", (req, res, next) => {
  void (async () => {
    const { user } = await getRequestUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    res.json({ user });
  })().catch((error) => {
    next(error);
  });
});

apiRouter.post("/auth/logout", (req, res, next) => {
  void (async () => {
    const { token } = await getRequestUser(req);
    if (token) {
      await logoutSession(token);
    }

    res.status(204).end();
  })().catch((error) => {
    next(error);
  });
});

apiRouter.get("/stats", (req, res, next) => {
  void (async () => {
    const { user } = await getRequestUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    res.json(await getStudyStats(user.id));
  })().catch((error) => {
    next(error);
  });
});

apiRouter.get("/flashcards/next", (req, res, next) => {
  void (async () => {
    const { user } = await getRequestUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    res.json(await getNextStudyCard(user.id));
  })().catch((error) => {
    next(error);
  });
});

apiRouter.get("/suggestions", async (req, res, next) => {
  try {
    const { user } = await getRequestUser(req);
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
    const { user } = await getRequestUser(req);
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
    const { user } = await getRequestUser(req);
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
    const { user } = await getRequestUser(req);
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
  void (async () => {
    const { user } = await getRequestUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const cardId = z.coerce.number().int().positive().parse(req.params.id);
    const payload = reviewRequestSchema.parse(req.body);
    res.json(await reviewCard(user.id, cardId, payload));
  })().catch((error) => {
    next(error);
  });
});

apiRouter.delete("/flashcards/:id", (req, res, next) => {
  void (async () => {
    const { user } = await getRequestUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const cardId = z.coerce.number().int().positive().parse(req.params.id);
    res.json(await removeFlashcard(user.id, cardId));
  })().catch((error) => {
    next(error);
  });
});
