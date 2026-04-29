import { nounGenderOptions, partOfSpeechOptions, reviewResults } from "@study/shared";
import { z } from "zod";

const languageSchema = z.enum(["en", "he"]);

export const translationRequestSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  sourceLanguage: languageSchema,
  targetLanguage: languageSchema
});

export const speechRequestSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  language: languageSchema
});

export const createFlashcardRequestSchema = z.object({
  sourceText: z.string().trim().min(1),
  sourceLanguage: languageSchema,
  targetText: z.string().trim().min(1),
  targetLanguage: languageSchema,
  partOfSpeech: z.enum(partOfSpeechOptions),
  nounGender: z.enum(nounGenderOptions).nullable(),
  imagePrompt: z.string().trim().min(1).optional(),
  isMock: z.boolean()
});

export const reviewRequestSchema = z.object({
  result: z.enum(reviewResults)
});

export const registerUserRequestSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, underscores, or hyphens only")
});

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

export const googleAuthRequestSchema = z.object({
  credential: z.string().trim().min(1)
});
