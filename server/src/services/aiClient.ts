import type {
  AppLanguage,
  CreateFlashcardRequest,
  FlashcardRecord,
  SuggestedFlashcard,
  TranslationRequest,
  TranslationResult
} from "@study/shared";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { appConfig } from "../config.js";
import { extractJsonObject } from "../lib/json.js";
import { ensureDir } from "../lib/paths.js";

type GeneratedImage = {
  relativePath: string;
};

const IMAGE_STYLE_DESCRIPTOR =
  "cel shaded Pixar aesthetic, soft cinematic volumetric lighting, vibrant colors, whimsical, cel shading, hybrid 2D/3D aesthetic, simple";
const IMAGE_SCENE_REQUIREMENTS =
  "Describe a detailed scene with a clear subject, visible environment, layered background elements, and non-solid surroundings. Never include written text, letters, captions, labels, signage, or typography anywhere in the image.";

const translationResultSchema = z.object({
  translation: z.string().min(1)
});

const imagePromptResultSchema = z.object({
  imagePrompt: z.string().min(1)
});

const suggestionsResultSchema = z.object({
  suggestions: z
    .array(
      z.object({
        sourceText: z.string().min(1),
        targetText: z.string().min(1)
      })
    )
    .length(10)
});

const englishSuggestionSeedSchema = z.object({
  suggestions: z.array(z.object({ englishText: z.string().min(1) })).length(10)
});

const translatedSuggestionsSchema = z.object({
  translations: z.array(z.object({ englishText: z.string().min(1), translatedText: z.string().min(1) })).length(10)
});

type FlashcardMeaning = Pick<CreateFlashcardRequest, "sourceText" | "sourceLanguage" | "targetText" | "targetLanguage">;

function languageName(language: AppLanguage) {
  return language === "en" ? "English" : "Hebrew";
}

function endpointUrl(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalizedBase);
}

function mimeTypeToExtension(mimeType: string | null | undefined) {
  if (!mimeType) {
    return "jpg";
  }

  if (mimeType.includes("png")) {
    return "png";
  }

  if (mimeType.includes("webp")) {
    return "webp";
  }

  return "jpg";
}

function parseImageSize(size: string) {
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return { width: 1024, height: 1024 };
  }

  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

function parseDataUri(dataUri: string) {
  const match = dataUri.match(/^data:(.*?);base64,(.*)$/);
  const mimeType = match?.[1];
  const base64Data = match?.[2];

  if (!mimeType || !base64Data) {
    throw new Error("Invalid data URI returned by image provider");
  }

  return {
    mimeType,
    buffer: Buffer.from(base64Data, "base64")
  };
}

function withImageRequirements(prompt: string) {
  return `${prompt}. ${IMAGE_SCENE_REQUIREMENTS} Style: ${IMAGE_STYLE_DESCRIPTOR}.`;
}

function extractResponseOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("LLM response was not an object");
  }

  if ("output_text" in payload && typeof (payload as { output_text?: unknown }).output_text === "string") {
    return (payload as { output_text: string }).output_text;
  }

  if ("output" in payload && Array.isArray((payload as { output?: unknown }).output)) {
    for (const item of (payload as { output: unknown[] }).output) {
      if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray((item as { content?: unknown }).content)) {
        continue;
      }

      for (const contentItem of (item as { content: unknown[] }).content) {
        if (
          contentItem &&
          typeof contentItem === "object" &&
          "type" in contentItem &&
          (contentItem as { type?: unknown }).type === "output_text" &&
          "text" in contentItem &&
          typeof (contentItem as { text?: unknown }).text === "string"
        ) {
          return (contentItem as { text: string }).text;
        }
      }
    }
  }

  throw new Error("LLM response did not include output_text");
}

async function throwApiError(prefix: string, response: Response): Promise<never> {
  const fallback = `${prefix} failed with status ${response.status}`;

  try {
    const payload = (await response.json()) as {
      error?: {
        message?: string;
        type?: string;
        param?: string | null;
      };
    };
    const message = payload.error?.message;
    const param = payload.error?.param;

    if (message) {
      throw new Error(param ? `${fallback}: ${message} (param: ${param})` : `${fallback}: ${message}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message !== "Unexpected end of JSON input") {
      throw error;
    }
  }

  throw new Error(fallback);
}

class MockAiClient {
  readonly mode = "mock" as const;

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const prefix = request.targetLanguage === "he" ? "תרגום מדומה" : "Mock translation";

    return {
      sourceText: request.text.trim(),
      sourceLanguage: request.sourceLanguage,
      targetText: `${prefix}: ${request.text.trim()}`,
      targetLanguage: request.targetLanguage,
      partOfSpeech: "phrase",
      nounGender: null,
      isMock: true
    };
  }

  async describeFlashcardScene(input: FlashcardMeaning) {
    const focusText = input.sourceLanguage === "en" ? input.sourceText : input.targetText;
    return `A friendly detailed study-card scene that visualizes ${focusText}, with a clear environment and a rich non-solid background, with no text in the image`;
  }

  async generateIllustration(prompt: string) {
    ensureDir(appConfig.generatedAssetDir);

    const fileName = `${randomUUID()}.svg`;
    const relativePath = fileName;
    const filePath = join(appConfig.generatedAssetDir, fileName);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
        <defs>
          <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#f7dff3" />
            <stop offset="100%" stop-color="#d9d8ff" />
          </linearGradient>
          <linearGradient id="ground" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="#f5d0cc" />
            <stop offset="100%" stop-color="#d0c2ff" />
          </linearGradient>
        </defs>
        <rect width="1024" height="1024" fill="url(#sky)" />
        <circle cx="820" cy="190" r="110" fill="#fff6fd" opacity="0.9" />
        <ellipse cx="512" cy="862" rx="380" ry="148" fill="url(#ground)" />
        <ellipse cx="230" cy="300" rx="110" ry="58" fill="#ffffff" opacity="0.42" />
        <ellipse cx="770" cy="328" rx="132" ry="64" fill="#ffffff" opacity="0.34" />
        <circle cx="512" cy="420" r="116" fill="#f7c8b2" />
        <rect x="384" y="520" width="256" height="214" rx="72" fill="#8d74e8" />
        <rect x="314" y="560" width="110" height="210" rx="56" fill="#8d74e8" transform="rotate(18 314 560)" />
        <rect x="600" y="560" width="110" height="210" rx="56" fill="#8d74e8" transform="rotate(-18 600 560)" />
        <rect x="390" y="744" width="100" height="182" rx="54" fill="#6844a8" transform="rotate(8 390 744)" />
        <rect x="534" y="744" width="100" height="182" rx="54" fill="#6844a8" transform="rotate(-8 534 744)" />
        <circle cx="332" cy="256" r="34" fill="#ffbed8" />
        <circle cx="696" cy="248" r="28" fill="#bda1ff" />
        <circle cx="742" cy="540" r="24" fill="#ffd1ef" />
      </svg>
    `.trim();

    await writeFile(filePath, svg, "utf8");

    return { relativePath };
  }

  async suggestRelatedFlashcards(
    recentCards: FlashcardRecord[],
    sourceLanguage: AppLanguage,
    targetLanguage: AppLanguage,
    variationHint?: string
  ): Promise<SuggestedFlashcard[]> {
    const seed = recentCards.at(0)?.sourceText ?? "book";
    const suffix = variationHint ? variationHint.slice(-4) : "seed";
    return Array.from({ length: 10 }, (_, index) => ({
      id: `mock-${suffix}-${index + 1}`,
      sourceText: `${seed} ${index + 1}`,
      sourceLanguage,
      targetText: sourceLanguage === "en" ? `תרגום ${index + 1}` : `translation ${index + 1}`,
      targetLanguage,
      partOfSpeech: "phrase",
      nounGender: null,
      isMock: true
    }));
  }
}

class OpenAiCompatibleAiClient {
  readonly mode = "openai-compatible" as const;

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (!appConfig.llmApiBaseUrl || !appConfig.llmApiKey || !appConfig.llmModel) {
      throw new Error("Missing LLM configuration");
    }

    const systemPrompt = [
      "You are a translation and vocabulary helper.",
      "Return JSON only with the key translation.",
      "Translate the source text faithfully into the target language.",
      "If the target language is Hebrew, first determine the correct Hebrew translation without nikud.",
      "Then add nikud to that exact translation.",
      "Do not remove, replace, or reorder any Hebrew letters when adding nikud; only add nikud marks on top of the same letters."
    ].join(" ");

    const userPrompt = [
      `Source language: ${languageName(request.sourceLanguage)}.`,
      `Target language: ${languageName(request.targetLanguage)}.`,
      `Text: ${request.text.trim()}`
    ].join(" ");

    const response = await fetch(endpointUrl(appConfig.llmApiBaseUrl, "responses"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appConfig.llmApiKey}`
      },
      body: JSON.stringify({
        model: appConfig.llmModel,
        reasoning: {
          effort: "low"
        },
        instructions: systemPrompt,
        input: userPrompt
      })
    });

    if (!response.ok) {
      await throwApiError("LLM request", response);
    }

    const payload = (await response.json()) as unknown;
    const content = extractResponseOutputText(payload);

    const parsed = translationResultSchema.parse(extractJsonObject(content));

    return {
      sourceText: request.text.trim(),
      sourceLanguage: request.sourceLanguage,
      targetText: parsed.translation.trim(),
      targetLanguage: request.targetLanguage,
      partOfSpeech: "phrase",
      nounGender: null,
      isMock: false
    };
  }

  async describeFlashcardScene(input: FlashcardMeaning): Promise<string> {
    if (!appConfig.llmApiBaseUrl || !appConfig.llmApiKey || !appConfig.llmModel) {
      throw new Error("Missing LLM configuration");
    }

    const systemPrompt = [
      "You write image prompts for educational flashcards.",
      "Return JSON only with the key imagePrompt.",
      "Describe a single vivid scene that conveys the meaning of the word or phrase.",
      "Include foreground subject details plus environment and background details.",
      "Do not include any written text, letters, signage, captions, or labels in the image.",
      "Never use a plain or solid-color background."
    ].join(" ");

    const userPrompt = [
      `Source language: ${languageName(input.sourceLanguage)}.`,
      `Target language: ${languageName(input.targetLanguage)}.`,
      `Source text: ${input.sourceText}.`,
      `Target text: ${input.targetText}.`,
      "Write the scene description in English."
    ].join(" ");

    const response = await fetch(endpointUrl(appConfig.llmApiBaseUrl, "responses"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appConfig.llmApiKey}`
      },
      body: JSON.stringify({
        model: appConfig.llmModel,
        reasoning: {
          effort: "low"
        },
        instructions: systemPrompt,
        input: userPrompt
      })
    });

    if (!response.ok) {
      await throwApiError("Image description request", response);
    }

    const payload = (await response.json()) as unknown;
    const content = extractResponseOutputText(payload);
    const parsed = imagePromptResultSchema.parse(extractJsonObject(content));
    return parsed.imagePrompt.trim();
  }

  async generateIllustration(prompt: string): Promise<GeneratedImage> {
    const styledPrompt = withImageRequirements(prompt);

    if (appConfig.falKey) {
      return generateWithFal(styledPrompt);
    }

    if (!appConfig.imageApiBaseUrl || !appConfig.imageApiKey || !appConfig.imageModel) {
      throw new Error("Missing image configuration");
    }

    ensureDir(appConfig.generatedAssetDir);

    const response = await fetch(endpointUrl(appConfig.imageApiBaseUrl, "images/generations"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appConfig.imageApiKey}`
      },
      body: JSON.stringify({
        model: appConfig.imageModel,
        prompt: styledPrompt,
        size: appConfig.imageSize,
        quality: appConfig.imageQuality
      })
    });

    if (!response.ok) {
      await throwApiError("Image request", response);
    }

    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };

    const firstImage = payload.data?.[0];
    if (!firstImage) {
      throw new Error("Image response did not include an image");
    }

    let imageBuffer: Buffer;
    let extension = "png";

    if (firstImage.b64_json) {
      imageBuffer = Buffer.from(firstImage.b64_json, "base64");
    } else if (firstImage.url) {
      const imageResponse = await fetch(firstImage.url);
      if (!imageResponse.ok) {
        throw new Error(`Could not download generated image: ${imageResponse.status}`);
      }

      const mimeType = imageResponse.headers.get("content-type") ?? "";
      extension = mimeType.includes("jpeg") ? "jpg" : "png";
      imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    } else {
      throw new Error("Image response did not include data");
    }

    const fileName = `${randomUUID()}.${extension}`;
    const relativePath = fileName;
    const filePath = join(appConfig.generatedAssetDir, fileName);
    await writeFile(filePath, imageBuffer);

    return { relativePath };
  }

  async suggestRelatedFlashcards(
    recentCards: FlashcardRecord[],
    sourceLanguage: AppLanguage,
    targetLanguage: AppLanguage,
    variationHint?: string
  ): Promise<SuggestedFlashcard[]> {
    if (!appConfig.llmApiBaseUrl || !appConfig.llmApiKey || !appConfig.llmModel) {
      throw new Error("Missing LLM configuration");
    }

    const context = recentCards
      .map((card, index) => `${index + 1}. ${card.sourceText} -> ${card.targetText}`)
      .join("\n");

    const systemPrompt = [
      "You create vocabulary expansion suggestions for a flashcard app.",
      "Return JSON only with the key suggestions.",
      "suggestions must be an array of exactly 10 objects.",
      "Each object must contain englishText.",
      "Generate all suggestions in English only.",
      "The suggestions should be conceptually or lexically related to the seed items.",
      "Include a balanced mix of nouns, verbs, adjectives, and exactly 2 multi-word phrases.",
      "Keep each englishText concise and useful for study.",
      "Use the variation token only to diversify the returned ideas while keeping them relevant."
    ].join(" ");

    const userPrompt = [
      `Source language: ${languageName(sourceLanguage)}.`,
      `Target language: ${languageName(targetLanguage)}.`,
      variationHint ? `Variation token: ${variationHint}.` : "",
      "Use these recent flashcards as the semantic neighborhood:",
      context
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch(endpointUrl(appConfig.llmApiBaseUrl, "responses"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appConfig.llmApiKey}`
      },
      body: JSON.stringify({
        model: appConfig.llmModel,
        reasoning: {
          effort: "medium"
        },
        instructions: systemPrompt,
        input: userPrompt
      })
    });

    if (!response.ok) {
      await throwApiError("Suggestion request", response);
    }

    const payload = (await response.json()) as unknown;
    const content = extractResponseOutputText(payload);
    const parsedEnglish = englishSuggestionSeedSchema.parse(extractJsonObject(content));
    const englishItems = parsedEnglish.suggestions.map((suggestion) => suggestion.englishText.trim());
    const needsHebrew = sourceLanguage === "he" || targetLanguage === "he";

    let translatedPairs = englishItems.map((englishText) => ({
      englishText,
      translatedText: englishText
    }));

    if (needsHebrew) {
      const translationSystemPrompt = [
        "You translate English study items into Hebrew.",
        "Return JSON only with the key translations.",
        "translations must be an array with the same order and length as the input items.",
        "Each object must contain englishText and translatedText.",
        "First determine the correct Hebrew translation without nikud.",
        "Then add nikud to that exact Hebrew translation.",
        "Do not remove, replace, or reorder any Hebrew letters when adding nikud; only add nikud marks on top of the same letters."
      ].join(" ");

      const translationUserPrompt = [
        "Translate these English study items into Hebrew with nikud.",
        ...englishItems.map((item, index) => `${index + 1}. ${item}`)
      ].join("\n");

      const translationResponse = await fetch(endpointUrl(appConfig.llmApiBaseUrl, "responses"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${appConfig.llmApiKey}`
        },
        body: JSON.stringify({
          model: appConfig.llmModel,
          reasoning: {
            effort: "medium"
          },
          instructions: translationSystemPrompt,
          input: translationUserPrompt
        })
      });

      if (!translationResponse.ok) {
        await throwApiError("Suggestion translation request", translationResponse);
      }

      const translationPayload = (await translationResponse.json()) as unknown;
      const translationContent = extractResponseOutputText(translationPayload);
      translatedPairs = translatedSuggestionsSchema.parse(extractJsonObject(translationContent)).translations;
    }

    return translatedPairs.map((item, index) => ({
      id: `${Date.now()}-${index}`,
      sourceText: sourceLanguage === "en" ? item.englishText.trim() : item.translatedText.trim(),
      sourceLanguage,
      targetText: targetLanguage === "en" ? item.englishText.trim() : item.translatedText.trim(),
      targetLanguage,
      partOfSpeech: "phrase",
      nounGender: null,
      isMock: false
    }));
  }
}

async function generateWithFal(prompt: string): Promise<GeneratedImage> {
  if (!appConfig.falKey) {
    throw new Error("Missing FAL configuration");
  }

  ensureDir(appConfig.generatedAssetDir);

  const response = await fetch(`https://fal.run/${appConfig.falImageModel}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${appConfig.falKey}`
    },
    body: JSON.stringify({
      prompt,
      image_size: parseImageSize(appConfig.imageSize),
      num_inference_steps: 4,
      num_images: 1,
      output_format: "jpeg",
      sync_mode: true,
      enable_safety_checker: true
    })
  });

  if (!response.ok) {
    await throwApiError("FAL image request", response);
  }

  const payload = (await response.json()) as {
    images?: Array<{
      url?: string;
      content_type?: string;
    }>;
  };

  const firstImage = payload.images?.[0];
  if (!firstImage?.url) {
    throw new Error("FAL image response did not include an image");
  }

  let imageBuffer: Buffer;
  let extension = mimeTypeToExtension(firstImage.content_type);

  if (firstImage.url.startsWith("data:")) {
    const parsed = parseDataUri(firstImage.url);
    imageBuffer = parsed.buffer;
    extension = mimeTypeToExtension(parsed.mimeType);
  } else {
    const imageResponse = await fetch(firstImage.url);
    if (!imageResponse.ok) {
      throw new Error(`Could not download generated FAL image: ${imageResponse.status}`);
    }

    extension = mimeTypeToExtension(imageResponse.headers.get("content-type") ?? firstImage.content_type);
    imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  }

  const fileName = `${randomUUID()}.${extension}`;
  const relativePath = fileName;
  const filePath = join(appConfig.generatedAssetDir, fileName);
  await writeFile(filePath, imageBuffer);

  return { relativePath };
}

export function createAiClient() {
  const hasLiveConfig =
    Boolean(appConfig.llmApiBaseUrl) &&
    Boolean(appConfig.llmApiKey) &&
    Boolean(appConfig.llmModel) &&
    (Boolean(appConfig.falKey) ||
      (Boolean(appConfig.imageApiBaseUrl) && Boolean(appConfig.imageApiKey) && Boolean(appConfig.imageModel)));

  return hasLiveConfig ? new OpenAiCompatibleAiClient() : new MockAiClient();
}
