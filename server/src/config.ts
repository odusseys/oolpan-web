import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default("http://127.0.0.1:5173"),
  DATABASE_PATH: z.string().default("./data/flashcards.sqlite"),
  GENERATED_ASSET_DIR: z.string().default("./generated/images"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  FAL_KEY: z.string().optional(),
  FAL_IMAGE_MODEL: z.string().default("fal-ai/flux/schnell"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  OPENAI_TEXT_MODEL: z.string().default("gpt-5.4-mini"),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2"),
  OPENAI_AUDIO_MODEL: z.string().default("gpt-4o-mini-tts"),
  OPENAI_AUDIO_VOICE: z.string().default("cedar"),
  LLM_API_BASE_URL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  IMAGE_API_BASE_URL: z.string().optional(),
  IMAGE_API_KEY: z.string().optional(),
  IMAGE_MODEL: z.string().optional(),
  IMAGE_QUALITY: z.enum(["low", "medium", "high"]).default("low"),
  IMAGE_SIZE: z.string().default("1024x1024")
});

const env = envSchema.parse(process.env);
const openAiKey = env.OPENAI_API_KEY ?? env.OPENAI_KEY;
const defaultApiBaseUrl = env.OPENAI_BASE_URL;

export const appConfig = {
  port: env.PORT,
  clientOrigin: env.CLIENT_ORIGIN,
  allowedClientOrigins: Array.from(new Set([env.CLIENT_ORIGIN, "http://127.0.0.1:5173", "http://localhost:5173"])),
  databasePath: resolve(process.cwd(), env.DATABASE_PATH),
  generatedAssetDir: resolve(process.cwd(), env.GENERATED_ASSET_DIR),
  googleClientId: env.GOOGLE_CLIENT_ID,
  falKey: env.FAL_KEY,
  falImageModel: env.FAL_IMAGE_MODEL,
  llmApiBaseUrl: env.LLM_API_BASE_URL ?? defaultApiBaseUrl,
  llmApiKey: env.LLM_API_KEY ?? openAiKey,
  llmModel: env.LLM_MODEL ?? env.OPENAI_TEXT_MODEL,
  audioApiBaseUrl: defaultApiBaseUrl,
  audioApiKey: openAiKey,
  audioModel: env.OPENAI_AUDIO_MODEL,
  audioVoice: env.OPENAI_AUDIO_VOICE,
  imageApiBaseUrl: env.IMAGE_API_BASE_URL ?? defaultApiBaseUrl,
  imageApiKey: env.IMAGE_API_KEY ?? openAiKey,
  imageModel: env.IMAGE_MODEL ?? env.OPENAI_IMAGE_MODEL,
  imageQuality: env.IMAGE_QUALITY,
  imageSize: env.IMAGE_SIZE
};

export type AppConfig = typeof appConfig;
