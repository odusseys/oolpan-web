import cors from "cors";
import express from "express";
import { appConfig } from "./config.js";
import { initializeSchema } from "./db/schema.js";
import { apiRouter } from "./routes/api.js";

initializeSchema();

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        const isNgrokOrigin =
          typeof origin === "string" &&
          (origin.endsWith(".ngrok-free.app") || origin.endsWith(".ngrok.app") || origin.endsWith(".ngrok-free.dev"));

        if (!origin || isNgrokOrigin || appConfig.allowedClientOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      }
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use("/assets", express.static(appConfig.generatedAssetDir));
  app.use("/api", apiRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown server error";
    res.status(400).json({ message });
  });

  return app;
}
