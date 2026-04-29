import cors from "cors";
import express, { type Express } from "express";
import { appConfig } from "./config.js";
import { initializeSchema } from "./db/schema.js";
import { apiRouter } from "./routes/api.js";

let appPromise: Promise<Express> | null = null;

async function buildApp() {
  await initializeSchema();
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        const isNgrokOrigin =
          typeof origin === "string" &&
          (origin.endsWith(".ngrok-free.app") || origin.endsWith(".ngrok.app") || origin.endsWith(".ngrok-free.dev"));
        const isVercelOrigin =
          typeof origin === "string" &&
          (origin.endsWith(".vercel.app") || origin.endsWith(".vercel.live"));
        const isOolpanOrigin =
          typeof origin === "string" &&
          (origin === "https://oolpan.com" ||
            origin === "https://www.oolpan.com" ||
            origin.endsWith(".oolpan.com"));

        if (!origin || isNgrokOrigin || isVercelOrigin || isOolpanOrigin || appConfig.allowedClientOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      }
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", apiRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown server error";
    res.status(400).json({ message });
  });

  return app;
}

export function getApp() {
  if (!appPromise) {
    appPromise = buildApp().catch((error) => {
      appPromise = null;
      throw error;
    });
  }

  return appPromise;
}
