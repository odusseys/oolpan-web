import type {
  AppLanguage,
  CreateFlashcardRequest,
  FlashcardRecord,
  SpeechRequest,
  SpeechResponse,
  SuggestedFlashcard,
  TranslationRequest,
  TranslationResult
} from "@study/shared";
import { Jimp } from "jimp";
import { z } from "zod";
import { appConfig } from "../config.js";
import { extractJsonObject } from "../lib/json.js";

type GeneratedImage = {
  dataUrl: string;
};

type GeneratedSpeech = SpeechResponse;

const IMAGE_STYLE_DESCRIPTOR =
  "cel shaded Pixar aesthetic, soft cinematic volumetric lighting, vibrant colors, whimsical, cel shading, hybrid 2D/3D aesthetic, simple";
const IMAGE_SCENE_REQUIREMENTS =
  "For ordinary vocabulary, show the most literal, direct, and easily recognizable real-world subject or action. Avoid abstract metaphors, symbolic substitutions, visual puns, surreal scenes, or far-fetched associations unless required for adult-safety. Describe a detailed scene with a clear subject, visible environment, layered background elements, and non-solid surroundings. Never include written text, letters, captions, labels, signage, or typography anywhere in the image.";
const ADULT_CONTENT_REQUIREMENTS =
  "If the vocabulary could be adult, sexual, intimate, or explicit in nature, use a metaphorical educational visual only. Do not include nudity, sexual acts, fetish elements, explicit body focus, intimate touching, underwear scenes, or other adult imagery. Prefer symbolic objects, mood, weather, color, distance, or other indirect metaphors.";

const ADULT_TERM_PATTERNS = [
  /\bsex\b/i,
  /\bsexual\b/i,
  /\bsexy\b/i,
  /\bnude\b/i,
  /\bnaked\b/i,
  /\berotic\b/i,
  /\bintimate\b/i,
  /\bkink\b/i,
  /\bfetish\b/i,
  /\bcondom\b/i,
  /\bbreast\b/i,
  /\bboob\b/i,
  /\bpenis\b/i,
  /\bvagina\b/i,
  /\bgenital\b/i,
  /\bclimax\b/i,
  /\borgasm\b/i,
  /\bmoan\b/i,
  /\bseduce\b/i,
  /\bbedroom\b/i,
  /\blust\b/i,
  /\bkiss\b/i,
  /\bmake ?out\b/i,
  /\bfuck\b/i,
  /\bcock\b/i,
  /\bdick\b/i,
  /\bpussy\b/i,
  /\bslut\b/i,
  /\bwhore\b/i,
  /\bporn\b/i,
  /\bxxx\b/i,
  /סקס/u,
  /מיני/u,
  /מיניות/u,
  /עירום/u,
  /אינטימי/u,
  /אירוטי/u,
  /נשיקה/u,
  /זין/u,
  /פות/u,
  /אורגז/u
];

const translationResultSchema = z.object({
  translation: z.string().min(1)
});

const googleTranslateResponseSchema = z.object({
  data: z.object({
    translations: z.array(z.object({ translatedText: z.string().min(1) })).min(1)
  })
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

const transliterationResultSchema = z.object({
  transliteration: z.string().min(1)
});

const nikudResultSchema = z.object({
  textWithNikud: z.string().min(1)
});

const pluralizationResultSchema = z.object({
  canPluralize: z.boolean(),
  sourcePluralText: z.string().min(1).nullable(),
  targetPluralText: z.string().min(1).nullable()
});

type FlashcardMeaning = Pick<CreateFlashcardRequest, "sourceText" | "sourceLanguage" | "targetText" | "targetLanguage">;
type FlashcardPluralization = Pick<CreateFlashcardRequest, "sourcePluralText" | "targetPluralText">;

function miniModel(model: string) {
  if (model.includes("-mini")) {
    return model;
  }

  if (model.startsWith("gpt-")) {
    return `${model}-mini`;
  }

  return model;
}

function languageName(language: AppLanguage) {
  return language === "en" ? "English" : "Hebrew";
}

function googleLanguageCode(language: AppLanguage) {
  return language;
}

function stripHebrewNikud(text: string) {
  return text.normalize("NFC").replace(/[\u0591-\u05C7]/g, "");
}

function decodeHtmlEntities(text: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"'
  };

  return text.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (entity, value: string) => {
    const normalized = value.toLowerCase();

    if (normalized.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
    }

    if (normalized.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    }

    return namedEntities[normalized] ?? entity;
  });
}

function normalizeSuggestionText(text: string) {
  return text
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

function endpointUrl(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalizedBase);
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

async function resizeImageToDataUrl(imageBuffer: Buffer) {
  const image = await Jimp.read(imageBuffer);
  image.resize({ w: 512, h: 512 });
  return image.getBase64("image/jpeg", { quality: 82 });
}

function createSilentWavBuffer(durationMs = 320, sampleRate = 24_000) {
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const dataSize = sampleCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function withImageRequirements(prompt: string) {
  return `${prompt}. ${IMAGE_SCENE_REQUIREMENTS} Style: ${IMAGE_STYLE_DESCRIPTOR}.`;
}

function isPotentiallyAdultMeaning(input: FlashcardMeaning) {
  const combined = [input.sourceText, input.targetText].join(" ");
  return ADULT_TERM_PATTERNS.some((pattern) => pattern.test(combined));
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
    const adultSafety = isPotentiallyAdultMeaning(input)
      ? ", rendered as a metaphorical non-explicit study image with symbolic objects and no adult elements"
      : "";
    return `A friendly detailed study-card scene that directly and literally shows ${focusText}${adultSafety}, with a clear environment and a rich non-solid background, with no text in the image`;
  }

  async generateIllustration(prompt: string) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
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
        <rect width="512" height="512" fill="url(#sky)" />
        <circle cx="410" cy="95" r="55" fill="#fff6fd" opacity="0.9" />
        <ellipse cx="256" cy="430" rx="190" ry="74" fill="url(#ground)" />
        <ellipse cx="115" cy="150" rx="55" ry="29" fill="#ffffff" opacity="0.42" />
        <ellipse cx="385" cy="164" rx="66" ry="32" fill="#ffffff" opacity="0.34" />
        <circle cx="256" cy="210" r="58" fill="#f7c8b2" />
        <rect x="192" y="260" width="128" height="107" rx="36" fill="#8d74e8" />
        <rect x="157" y="280" width="55" height="105" rx="28" fill="#8d74e8" transform="rotate(18 157 280)" />
        <rect x="300" y="280" width="55" height="105" rx="28" fill="#8d74e8" transform="rotate(-18 300 280)" />
        <rect x="195" y="372" width="50" height="91" rx="27" fill="#6844a8" transform="rotate(8 195 372)" />
        <rect x="267" y="372" width="50" height="91" rx="27" fill="#6844a8" transform="rotate(-8 267 372)" />
        <circle cx="166" cy="128" r="17" fill="#ffbed8" />
        <circle cx="348" cy="124" r="14" fill="#bda1ff" />
        <circle cx="371" cy="270" r="12" fill="#ffd1ef" />
      </svg>
    `.trim();

    return {
      dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`
    };
  }

  async generateSpeech(request: SpeechRequest): Promise<GeneratedSpeech> {
    return {
      audioUrl: `data:audio/wav;base64,${createSilentWavBuffer().toString("base64")}`
    };
  }

  async transliterateHebrew(text: string): Promise<string> {
    return `mock transliteration: ${text.trim()}`;
  }

  async addNikudToHebrew(text: string): Promise<string> {
    return text.trim();
  }

  async pluralizeFlashcard(input: FlashcardMeaning): Promise<FlashcardPluralization | null> {
    const source = input.sourceText.trim();
    const target = input.targetText.trim();

    if (!source || !target) {
      return null;
    }

    return {
      sourcePluralText: input.sourceLanguage === "en" ? `${source}s` : `${source}ים`,
      targetPluralText: input.targetLanguage === "en" ? `${target}s` : `${target}ים`
    };
  }

  async suggestRelatedFlashcards(
    recentCards: FlashcardRecord[],
    sourceLanguage: AppLanguage,
    targetLanguage: AppLanguage,
    variationHint?: string,
    excludedEnglishItems: string[] = []
  ): Promise<SuggestedFlashcard[]> {
    const seed = recentCards[0]?.sourceText ?? "book";
    const suffix = variationHint ? variationHint.slice(-4) : "seed";
    const excluded = new Set(excludedEnglishItems.map(normalizeSuggestionText));
    const suggestions: SuggestedFlashcard[] = [];
    let index = 0;

    while (suggestions.length < 10) {
      index += 1;
      const sourceText = `${seed} ${suffix} ${index}`;
      const targetText = sourceLanguage === "en" ? `תרגום ${suffix} ${index}` : `translation ${suffix} ${index}`;
      const englishText = sourceLanguage === "en" ? sourceText : targetText;

      if (excluded.has(normalizeSuggestionText(englishText))) {
        continue;
      }

      suggestions.push({
        id: `mock-${suffix}-${index}`,
        sourceText,
        sourceLanguage,
        targetText,
        targetLanguage,
        partOfSpeech: "phrase",
        nounGender: null,
        isMock: true
      });
    }

    return suggestions;
  }
}

class OpenAiCompatibleAiClient {
  readonly mode = "openai-compatible" as const;

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (appConfig.googleTranslateApiKey) {
      return this.translateWithGoogle(request);
    }

    if (!appConfig.llmApiBaseUrl || !appConfig.llmApiKey || !appConfig.llmModel) {
      throw new Error("Missing LLM configuration");
    }

    const systemPrompt = [
      "You are a translation and vocabulary helper.",
      "Return JSON only with the key translation.",
      "Translate the source text into the target language using the natural phrasing someone would use in everyday conversation.",
      "Prefer the common spoken wording over a formal, literal, or dictionary-style translation when those differ.",
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
        model: miniModel(appConfig.llmModel),
        reasoning: {
          effort: "none"
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

  private async translateWithGoogle(request: TranslationRequest): Promise<TranslationResult> {
    const translations = await this.translateTextsWithGoogle([request.text.trim()], request.sourceLanguage, request.targetLanguage);
    const translation = translations[0];

    if (!translation) {
      throw new Error("Google Translate response did not include a translation");
    }

    return {
      sourceText: request.text.trim(),
      sourceLanguage: request.sourceLanguage,
      targetText: translation,
      targetLanguage: request.targetLanguage,
      partOfSpeech: "phrase",
      nounGender: null,
      isMock: false
    };
  }

  private async translateTextsWithGoogle(texts: string[], sourceLanguage: AppLanguage, targetLanguage: AppLanguage) {
    if (!appConfig.googleTranslateApiKey) {
      throw new Error("Missing Google Translate configuration");
    }

    const trimmedTexts = texts.map((text) => text.trim()).filter(Boolean);
    if (trimmedTexts.length === 0) {
      return [];
    }

    const url = new URL(appConfig.googleTranslateBaseUrl);
    url.searchParams.set("key", appConfig.googleTranslateApiKey);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: trimmedTexts,
        source: googleLanguageCode(sourceLanguage),
        target: googleLanguageCode(targetLanguage),
        format: "text"
      })
    });

    if (!response.ok) {
      await throwApiError("Google Translate request", response);
    }

    const payload = googleTranslateResponseSchema.parse((await response.json()) as unknown);
    const translations = payload.data.translations.map((item) => decodeHtmlEntities(item.translatedText.trim()));

    if (translations.length !== trimmedTexts.length) {
      throw new Error("Google Translate response length did not match request length");
    }

    return translations;
  }

  private async translateEnglishSuggestionsWithGoogle(englishItems: string[]) {
    const translations = await this.translateTextsWithGoogle(englishItems, "en", "he");
    return englishItems.map((englishText, index) => ({
      englishText,
      translatedText: translations[index] ?? englishText
    }));
  }

  async describeFlashcardScene(input: FlashcardMeaning): Promise<string> {
    if (!appConfig.llmApiBaseUrl || !appConfig.llmApiKey || !appConfig.llmModel) {
      throw new Error("Missing LLM configuration");
    }

    const systemPrompt = [
      "You write image prompts for educational flashcards.",
      "Return JSON only with the key imagePrompt.",
      "Describe a single vivid scene that shows the meaning of the word or phrase directly and literally.",
      "For ordinary vocabulary, use the obvious real-world object, person, place, or action.",
      "Avoid abstract metaphors, symbolic substitutions, visual puns, surreal imagery, or far-fetched associations unless adult-safety requires an indirect image.",
      "Include foreground subject details plus environment and background details.",
      "Do not include any written text, letters, signage, captions, or labels in the image.",
      "Never use a plain or solid-color background.",
      ADULT_CONTENT_REQUIREMENTS
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

    if (firstImage.b64_json) {
      imageBuffer = Buffer.from(firstImage.b64_json, "base64");
    } else if (firstImage.url) {
      const imageResponse = await fetch(firstImage.url);
      if (!imageResponse.ok) {
        throw new Error(`Could not download generated image: ${imageResponse.status}`);
      }

      imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    } else {
      throw new Error("Image response did not include data");
    }

    return {
      dataUrl: await resizeImageToDataUrl(imageBuffer)
    };
  }

  async generateSpeech(request: SpeechRequest): Promise<GeneratedSpeech> {
    if (!appConfig.audioApiBaseUrl || !appConfig.audioApiKey || !appConfig.audioModel || !appConfig.audioVoice) {
      throw new Error("Missing audio configuration");
    }

    const trimmedText = request.text.trim();
    const instructions = `Read exactly the provided text in ${languageName(request.language)}. Do not add, remove, explain, or complete anything.`;

    const response = await fetch(endpointUrl(appConfig.audioApiBaseUrl, "audio/speech"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appConfig.audioApiKey}`
      },
      body: JSON.stringify({
        model: appConfig.audioModel,
        voice: appConfig.audioVoice,
        input: trimmedText,
        instructions,
        response_format: "mp3"
      })
    });

    if (!response.ok) {
      await throwApiError("Speech request", response);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    return {
      audioUrl: `data:audio/mpeg;base64,${audioBuffer.toString("base64")}`
    };
  }

  async transliterateHebrew(text: string): Promise<string> {
    if (!appConfig.llmApiBaseUrl || !appConfig.llmApiKey || !appConfig.llmModel) {
      throw new Error("Missing LLM configuration");
    }

    const trimmedText = text.trim();
    const systemPrompt = [
      "You transliterate Hebrew for English-speaking language learners.",
      "Return JSON only with the key transliteration.",
      "Write the Hebrew text in simple Latin letters using common modern Israeli Hebrew pronunciation.",
      "Preserve word order.",
      "Do not use IPA symbols.",
      "Do not explain anything."
    ].join(" ");

    const response = await fetch(endpointUrl(appConfig.llmApiBaseUrl, "responses"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appConfig.llmApiKey}`
      },
      body: JSON.stringify({
        model: miniModel(appConfig.llmModel),
        reasoning: {
          effort: "none"
        },
        instructions: systemPrompt,
        input: trimmedText
      })
    });

    if (!response.ok) {
      await throwApiError("Transliteration request", response);
    }

    const payload = (await response.json()) as unknown;
    const content = extractResponseOutputText(payload);
    const parsed = transliterationResultSchema.parse(extractJsonObject(content));
    return parsed.transliteration.trim();
  }

  async addNikudToHebrew(text: string): Promise<string> {
    if (!appConfig.llmApiBaseUrl || !appConfig.llmApiKey || !appConfig.llmModel) {
      throw new Error("Missing LLM configuration");
    }

    const trimmedText = text.trim();
    const systemPrompt = [
      "You add nikud to Hebrew text for language learners.",
      "Return JSON only with the key textWithNikud.",
      "Add the correct Hebrew nikud marks to the provided text.",
      "Do not remove any existing Hebrew letters.",
      "Do not replace any existing Hebrew letters.",
      "Do not reorder any existing Hebrew letters.",
      "Do not add new Hebrew letters.",
      "Only add nikud marks to the exact existing Hebrew letters.",
      "Keep spaces, punctuation, and non-Hebrew text unchanged.",
      "Do not explain anything."
    ].join(" ");

    const response = await fetch(endpointUrl(appConfig.llmApiBaseUrl, "responses"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appConfig.llmApiKey}`
      },
      body: JSON.stringify({
        model: miniModel(appConfig.llmModel),
        reasoning: {
          effort: "none"
        },
        instructions: systemPrompt,
        input: trimmedText
      })
    });

    if (!response.ok) {
      await throwApiError("Nikud request", response);
    }

    const payload = (await response.json()) as unknown;
    const content = extractResponseOutputText(payload);
    const parsed = nikudResultSchema.parse(extractJsonObject(content));
    const textWithNikud = parsed.textWithNikud.trim();

    if (stripHebrewNikud(textWithNikud) !== stripHebrewNikud(trimmedText)) {
      throw new Error("Nikud response changed the original Hebrew letters");
    }

    return textWithNikud;
  }

  async pluralizeFlashcard(input: FlashcardMeaning): Promise<FlashcardPluralization | null> {
    if (!appConfig.llmApiBaseUrl || !appConfig.llmApiKey || !appConfig.llmModel) {
      throw new Error("Missing LLM configuration");
    }

    const systemPrompt = [
      "You identify whether a bilingual flashcard can be naturally reviewed in plural form.",
      "Return JSON only with the keys canPluralize, sourcePluralText, and targetPluralText.",
      "If the flashcard is a count noun or noun phrase with a normal plural form in both languages, set canPluralize true.",
      "When canPluralize is true, return the natural plural version of the full source text and the full target text.",
      "If either side cannot be naturally pluralized, set canPluralize false and both plural fields to null.",
      "Use everyday conversational wording.",
      "If a Hebrew plural is returned, include nikud.",
      "Do not explain anything."
    ].join(" ");

    const userPrompt = [
      `Source language: ${languageName(input.sourceLanguage)}.`,
      `Target language: ${languageName(input.targetLanguage)}.`,
      `Source text: ${input.sourceText.trim()}.`,
      `Target text: ${input.targetText.trim()}.`
    ].join("\n");

    const response = await fetch(endpointUrl(appConfig.llmApiBaseUrl, "responses"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appConfig.llmApiKey}`
      },
      body: JSON.stringify({
        model: miniModel(appConfig.llmModel),
        reasoning: {
          effort: "none"
        },
        instructions: systemPrompt,
        input: userPrompt
      })
    });

    if (!response.ok) {
      await throwApiError("Pluralization request", response);
    }

    const payload = (await response.json()) as unknown;
    const content = extractResponseOutputText(payload);
    const parsed = pluralizationResultSchema.parse(extractJsonObject(content));

    if (!parsed.canPluralize || !parsed.sourcePluralText?.trim() || !parsed.targetPluralText?.trim()) {
      return null;
    }

    return {
      sourcePluralText: parsed.sourcePluralText.trim(),
      targetPluralText: parsed.targetPluralText.trim()
    };
  }

  async suggestRelatedFlashcards(
    recentCards: FlashcardRecord[],
    sourceLanguage: AppLanguage,
    targetLanguage: AppLanguage,
    variationHint?: string,
    excludedEnglishItems: string[] = []
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
      "Maximize diversity: cover different semantic subtopics, situations, parts of speech, and levels of specificity.",
      "Avoid near-synonyms, same-root variants, plural-only variants, and repeated everyday objects from the same narrow category.",
      "Do not include any item from the avoid list, and do not include close paraphrases of avoid-list items.",
      "Include a balanced mix of nouns, verbs, adjectives, and exactly 2 multi-word phrases.",
      "Keep each englishText concise and useful for study.",
      "Use the variation token as a branch selector for a fresh set of ideas while keeping them relevant."
    ].join(" ");

    const userPrompt = [
      `Source language: ${languageName(sourceLanguage)}.`,
      `Target language: ${languageName(targetLanguage)}.`,
      variationHint ? `Variation token: ${variationHint}.` : "",
      "Use these recent flashcards as the semantic neighborhood:",
      context,
      excludedEnglishItems.length > 0
        ? ["Avoid these already visible or previously suggested English items:", ...excludedEnglishItems.map((item, index) => `${index + 1}. ${item}`)].join("\n")
        : ""
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
          effort: "none"
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
    const excludedSet = new Set(excludedEnglishItems.map(normalizeSuggestionText));
    const acceptedEnglishKeys = new Set<string>();
    const englishItems = parsedEnglish.suggestions
      .map((suggestion) => suggestion.englishText.trim())
      .filter((item) => {
        const key = normalizeSuggestionText(item);
        if (!key || excludedSet.has(key) || acceptedEnglishKeys.has(key)) {
          return false;
        }

        acceptedEnglishKeys.add(key);
        return true;
      });
    const needsHebrew = sourceLanguage === "he" || targetLanguage === "he";

    let translatedPairs: Array<{ englishText: string; translatedText: string }> = englishItems.map((englishText) => ({
      englishText,
      translatedText: englishText
    }));

    if (needsHebrew) {
      if (appConfig.googleTranslateApiKey) {
        translatedPairs = await this.translateEnglishSuggestionsWithGoogle(englishItems);
      } else {
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
              effort: "none"
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
        const parsedTranslations = translatedSuggestionsSchema.parse(extractJsonObject(translationContent));
        translatedPairs = parsedTranslations.translations.map((item) => ({
          englishText: item.englishText.trim(),
          translatedText: item.translatedText.trim()
        }));
      }
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

  if (firstImage.url.startsWith("data:")) {
    const parsed = parseDataUri(firstImage.url);
    imageBuffer = parsed.buffer;
  } else {
    const imageResponse = await fetch(firstImage.url);
    if (!imageResponse.ok) {
      throw new Error(`Could not download generated FAL image: ${imageResponse.status}`);
    }

    imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  }

  return {
    dataUrl: await resizeImageToDataUrl(imageBuffer)
  };
}

export function createAiClient() {
  const hasOpenAiCompatibleConfig =
    Boolean(appConfig.llmApiBaseUrl) &&
    Boolean(appConfig.llmApiKey) &&
    Boolean(appConfig.llmModel) &&
    (Boolean(appConfig.falKey) ||
      (Boolean(appConfig.imageApiBaseUrl) && Boolean(appConfig.imageApiKey) && Boolean(appConfig.imageModel)));
  const hasLiveConfig = Boolean(appConfig.googleTranslateApiKey) || hasOpenAiCompatibleConfig;

  return hasLiveConfig ? new OpenAiCompatibleAiClient() : new MockAiClient();
}
