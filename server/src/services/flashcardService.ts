import {
  LEARNED_SCORE_THRESHOLD,
  type AppLanguage,
  type CreateFlashcardRequest,
  type DeleteFlashcardResponse,
  type FlashcardRecord,
  type ReviewRequest,
  type ReviewResponse,
  type SpeechRequest,
  type StudyCard,
  type SuggestionsResponse
} from "@study/shared";
import {
  createFlashcard,
  deleteFlashcard,
  findFlashcardByPhrase,
  getDeckStats,
  getFlashcardById,
  listRecentFlashcards,
  listFlashcards,
  updateFlashcardReviewState
} from "../db/repository.js";
import { applyReviewOutcome, pickWeightedRandom } from "../lib/scheduler.js";
import { createAiClient } from "./aiClient.js";

const aiClient = createAiClient();
const lastServedFlashcardIds = new Map<number, number | null>();

type RequiredFlashcardPluralization = {
  sourcePluralText: string;
  targetPluralText: string;
};

function toImageUrl(imageData: string | null) {
  return imageData;
}

function toStudyCard(card: FlashcardRecord): StudyCard {
  const promptSide = Math.random() > 0.5 ? "source" : "target";
  const hasPluralForm = Boolean(card.sourcePluralText?.trim() && card.targetPluralText?.trim());
  const numberForm = hasPluralForm && Math.random() > 0.5 ? "plural" : "singular";
  const sourceText = numberForm === "plural" ? (card.sourcePluralText ?? card.sourceText) : card.sourceText;
  const sourceTransliteration =
    numberForm === "plural" ? card.sourcePluralTransliteration : card.sourceTransliteration;
  const targetText = numberForm === "plural" ? (card.targetPluralText ?? card.targetText) : card.targetText;
  const targetTransliteration =
    numberForm === "plural" ? card.targetPluralTransliteration : card.targetTransliteration;

  return {
    ...card,
    promptSide,
    numberForm,
    promptText: promptSide === "source" ? sourceText : targetText,
    promptLanguage: promptSide === "source" ? card.sourceLanguage : card.targetLanguage,
    promptTransliteration: promptSide === "source" ? sourceTransliteration : targetTransliteration,
    answerText: promptSide === "source" ? targetText : sourceText,
    answerLanguage: promptSide === "source" ? card.targetLanguage : card.sourceLanguage,
    answerTransliteration: promptSide === "source" ? targetTransliteration : sourceTransliteration,
    imageUrl: toImageUrl(card.imageData),
    samplingWeight: 0
  };
}

function hasRequiredHebrewTransliteration(card: FlashcardRecord) {
  const sourceReady = card.sourceLanguage !== "he" || Boolean(card.sourceTransliteration?.trim());
  const targetReady = card.targetLanguage !== "he" || Boolean(card.targetTransliteration?.trim());

  return sourceReady && targetReady;
}

function getMasteredFlashcardText(card: FlashcardRecord) {
  if (card.targetLanguage === "he") {
    return card.targetText;
  }

  if (card.sourceLanguage === "he") {
    return card.sourceText;
  }

  return card.targetText;
}

async function getHebrewTransliteration(text: string, language: AppLanguage, existing?: string | null) {
  if (existing?.trim()) {
    return existing.trim();
  }

  if (language !== "he") {
    return null;
  }

  return aiClient.transliterateHebrew(text);
}

async function addHebrewNikud(text: string, language: AppLanguage) {
  const trimmedText = text.trim();

  if (language !== "he") {
    return trimmedText;
  }

  return aiClient.addNikudToHebrew(trimmedText);
}

async function addNikudToFlashcardInput(input: CreateFlashcardRequest): Promise<CreateFlashcardRequest> {
  const [sourceText, targetText] = await Promise.all([
    addHebrewNikud(input.sourceText, input.sourceLanguage),
    addHebrewNikud(input.targetText, input.targetLanguage)
  ]);

  return {
    ...input,
    sourceText,
    targetText
  };
}

async function getPluralization(input: CreateFlashcardRequest): Promise<RequiredFlashcardPluralization | null> {
  if (input.sourcePluralText?.trim() && input.targetPluralText?.trim()) {
    return {
      sourcePluralText: input.sourcePluralText.trim(),
      targetPluralText: input.targetPluralText.trim()
    };
  }

  const pluralization = await aiClient.pluralizeFlashcard({
    sourceText: input.sourceText,
    sourceLanguage: input.sourceLanguage,
    targetText: input.targetText,
    targetLanguage: input.targetLanguage
  });

  if (!pluralization?.sourcePluralText?.trim() || !pluralization.targetPluralText?.trim()) {
    return null;
  }

  return {
    sourcePluralText: pluralization.sourcePluralText.trim(),
    targetPluralText: pluralization.targetPluralText.trim()
  };
}

async function addNikudToPluralization(input: CreateFlashcardRequest, pluralization: RequiredFlashcardPluralization | null) {
  if (!pluralization) {
    return null;
  }

  const [sourcePluralText, targetPluralText] = await Promise.all([
    addHebrewNikud(pluralization.sourcePluralText, input.sourceLanguage),
    addHebrewNikud(pluralization.targetPluralText, input.targetLanguage)
  ]);

  return {
    sourcePluralText,
    targetPluralText
  };
}

export async function createFlashcardWithImage(userId: number, input: CreateFlashcardRequest) {
  const normalizedInput = await addNikudToFlashcardInput(input);
  const existing = await findFlashcardByPhrase(userId, normalizedInput);
  if (existing?.imageData && existing.isActive && hasRequiredHebrewTransliteration(existing)) {
    return {
      card: existing,
      stats: await getDeckStats(userId)
    };
  }

  const imagePrompt =
    normalizedInput.imagePrompt ?? existing?.imagePrompt ?? (await aiClient.describeFlashcardScene({
      sourceText: normalizedInput.sourceText,
      sourceLanguage: normalizedInput.sourceLanguage,
      targetText: normalizedInput.targetText,
      targetLanguage: normalizedInput.targetLanguage
    }));
  const pluralization = await addNikudToPluralization(normalizedInput, await getPluralization(normalizedInput));
  const [sourceTransliteration, targetTransliteration] = await Promise.all([
    getHebrewTransliteration(normalizedInput.sourceText, normalizedInput.sourceLanguage, normalizedInput.sourceTransliteration),
    getHebrewTransliteration(normalizedInput.targetText, normalizedInput.targetLanguage, normalizedInput.targetTransliteration)
  ]);
  const [sourcePluralTransliteration, targetPluralTransliteration] = await Promise.all([
    pluralization?.sourcePluralText
      ? getHebrewTransliteration(pluralization.sourcePluralText, normalizedInput.sourceLanguage, normalizedInput.sourcePluralTransliteration)
      : null,
    pluralization?.targetPluralText
      ? getHebrewTransliteration(pluralization.targetPluralText, normalizedInput.targetLanguage, normalizedInput.targetPluralTransliteration)
      : null
  ]);
  const generated = existing?.imageData ? null : await aiClient.generateIllustration(imagePrompt);
  const saved = await createFlashcard(
    userId,
    {
      ...normalizedInput,
      imagePrompt,
      sourceTransliteration,
      targetTransliteration,
      sourcePluralText: pluralization?.sourcePluralText ?? null,
      targetPluralText: pluralization?.targetPluralText ?? null,
      sourcePluralTransliteration,
      targetPluralTransliteration
    },
    generated?.dataUrl ?? null
  );

  if (!saved) {
    throw new Error("Could not create flashcard");
  }

  return {
    card: saved,
    stats: await getDeckStats(userId)
  };
}

export async function getNextStudyCard(userId: number, excludedIds: number[] = []) {
  const cards = await listFlashcards(userId);
  if (cards.length === 1) {
    const onlyCard = cards[0];
    if (!onlyCard) {
      return null;
    }

    const singleCard = toStudyCard(onlyCard);
    singleCard.samplingWeight = pickWeightedRandom(cards, new Date(), [])?.samplingWeight ?? 0;
    lastServedFlashcardIds.set(userId, singleCard.id);
    return singleCard;
  }

  const lastServedFlashcardId = lastServedFlashcardIds.get(userId) ?? null;
  const effectiveExcludedIds =
    lastServedFlashcardId !== null ? Array.from(new Set([...excludedIds, lastServedFlashcardId])) : excludedIds;
  const picked = pickWeightedRandom(cards, new Date(), effectiveExcludedIds) ?? pickWeightedRandom(cards, new Date(), excludedIds);
  if (!picked) {
    return null;
  }

  const card = toStudyCard(picked.card);
  card.samplingWeight = picked.samplingWeight;
  lastServedFlashcardIds.set(userId, card.id);
  return card;
}

export async function getStudyStats(userId: number) {
  return getDeckStats(userId);
}

export function getAiMode() {
  return aiClient.mode;
}

export async function translatePhrase(request: { text: string; sourceLanguage: "en" | "he"; targetLanguage: "en" | "he" }) {
  return aiClient.translate(request);
}

export async function generateSpeech(request: SpeechRequest) {
  return aiClient.generateSpeech(request);
}

export async function suggestFlashcards(
  userId: number,
  sourceLanguage: AppLanguage,
  targetLanguage: AppLanguage,
  variationHint?: string,
  excludedEnglishItems: string[] = []
): Promise<SuggestionsResponse> {
  const recent = await listRecentFlashcards(userId, 5);
  if (recent.length === 0) {
    return { suggestions: [], basedOnCount: 0 };
  }

  const suggestions = await aiClient.suggestRelatedFlashcards(
    recent,
    sourceLanguage,
    targetLanguage,
    variationHint,
    excludedEnglishItems
  );
  return {
    suggestions,
    basedOnCount: recent.length
  };
}

export async function reviewCard(userId: number, cardId: number, body: ReviewRequest): Promise<ReviewResponse> {
  const card = await getFlashcardById(userId, cardId);
  if (!card) {
    throw new Error("Flashcard not found");
  }

  const updates = applyReviewOutcome(card, body.result);
  const isNewlyMastered =
    !card.masteredAt && card.weight <= LEARNED_SCORE_THRESHOLD && updates.weight > LEARNED_SCORE_THRESHOLD;
  const updatedCard = await updateFlashcardReviewState(userId, cardId, {
    ...updates,
    masteredAt: isNewlyMastered ? updates.lastReviewedAt : null
  });

  if (!updatedCard) {
    throw new Error("Could not update flashcard");
  }

  return {
    updatedCard,
    nextCard: await getNextStudyCard(userId, [cardId]),
    stats: await getDeckStats(userId),
    masteredFlashcard: isNewlyMastered
      ? {
          id: updatedCard.id,
          text: getMasteredFlashcardText(updatedCard)
        }
      : null
  };
}

export async function removeFlashcard(userId: number, cardId: number): Promise<DeleteFlashcardResponse> {
  const removed = await deleteFlashcard(userId, cardId);
  if (!removed) {
    throw new Error("Flashcard not found");
  }

  if ((lastServedFlashcardIds.get(userId) ?? null) === cardId) {
    lastServedFlashcardIds.set(userId, null);
  }

  return {
    removedId: cardId,
    nextCard: await getNextStudyCard(userId, [cardId]),
    stats: await getDeckStats(userId)
  };
}
