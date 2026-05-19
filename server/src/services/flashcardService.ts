import {
  LEARNED_SCORE_THRESHOLD,
  type AppLanguage,
  type CreateFlashcardRequest,
  type DeleteFlashcardResponse,
  type FlashcardRecord,
  type ReviewDirection,
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
import { applyReviewOutcome, computeSamplingWeight, sampleMultipleByScore } from "../lib/scheduler.js";
import { createAiClient } from "./aiClient.js";

const aiClient = createAiClient();
const lastServedReviewKeys = new Map<number, string | null>();

type RequiredFlashcardPluralization = {
  sourcePluralText: string;
  targetPluralText: string;
};

function toImageUrl(imageData: string | null) {
  return imageData;
}

function reviewKey(cardId: number, direction: ReviewDirection) {
  return `${cardId}:${direction}`;
}

function getDirectionProgress(card: FlashcardRecord, direction: ReviewDirection) {
  if (direction === "source_to_target") {
    return {
      weight: card.sourceToTargetWeight,
      reviewCount: card.sourceToTargetReviewCount,
      mistakeCount: card.sourceToTargetMistakeCount,
      consecutiveCorrect: card.sourceToTargetConsecutiveCorrect,
      lastReviewedAt: card.sourceToTargetLastReviewedAt,
      lastResult: card.sourceToTargetLastResult,
      masteredAt: card.sourceToTargetMasteredAt
    };
  }

  return {
    weight: card.targetToSourceWeight,
    reviewCount: card.targetToSourceReviewCount,
    mistakeCount: card.targetToSourceMistakeCount,
    consecutiveCorrect: card.targetToSourceConsecutiveCorrect,
    lastReviewedAt: card.targetToSourceLastReviewedAt,
    lastResult: card.targetToSourceLastResult,
    masteredAt: card.targetToSourceMasteredAt
  };
}

function getOppositeDirection(direction: ReviewDirection): ReviewDirection {
  return direction === "source_to_target" ? "target_to_source" : "source_to_target";
}

function getReviewCandidates(cards: FlashcardRecord[], now = new Date()) {
  return cards.flatMap((card) =>
    (["source_to_target", "target_to_source"] as const).map((direction) => {
      const progress = getDirectionProgress(card, direction);
      return {
        card,
        direction,
        samplingWeight: computeSamplingWeight(progress, now)
      };
    })
  );
}

function toStudyCard(card: FlashcardRecord, reviewDirection: ReviewDirection): StudyCard {
  const promptSide = reviewDirection === "source_to_target" ? "source" : "target";
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
    reviewDirection,
    numberForm,
    promptText: promptSide === "source" ? sourceText : targetText,
    promptLanguage: promptSide === "source" ? card.sourceLanguage : card.targetLanguage,
    promptTransliteration: promptSide === "source" ? sourceTransliteration : targetTransliteration,
    answerText: promptSide === "source" ? targetText : sourceText,
    answerLanguage: promptSide === "source" ? card.targetLanguage : card.sourceLanguage,
    answerTransliteration: promptSide === "source" ? targetTransliteration : sourceTransliteration,
    imageUrl: toImageUrl(card.imageData),
    samplingWeight: 0,
    directionWeight: getDirectionProgress(card, reviewDirection).weight,
    directionReviewCount: getDirectionProgress(card, reviewDirection).reviewCount
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

export async function getNextStudyCard(userId: number, excludedReviewKeyValues: string[] = []) {
  const cards = await listFlashcards(userId);
  const now = new Date();
  const excludedReviewKeys = new Set(excludedReviewKeyValues);
  const lastServedReviewKey = lastServedReviewKeys.get(userId) ?? null;
  if (lastServedReviewKey) {
    excludedReviewKeys.add(lastServedReviewKey);
  }

  const candidates = getReviewCandidates(cards, now);
  const eligibleCandidates = candidates.filter((candidate) => !excludedReviewKeys.has(reviewKey(candidate.card.id, candidate.direction)));
  const picked =
    sampleMultipleByScore(eligibleCandidates, (candidate) => candidate.samplingWeight, 1)[0] ??
    sampleMultipleByScore(candidates, (candidate) => candidate.samplingWeight, 1)[0];
  if (!picked) {
    return null;
  }

  const card = toStudyCard(picked.card, picked.direction);
  card.samplingWeight = picked.samplingWeight;
  lastServedReviewKeys.set(userId, reviewKey(card.id, picked.direction));
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

  const directionProgress = getDirectionProgress(card, body.direction);
  const oppositeProgress = getDirectionProgress(card, getOppositeDirection(body.direction));
  const updates = applyReviewOutcome(directionProgress, body.result);
  const isNewlyMastered =
    !directionProgress.masteredAt &&
    directionProgress.weight <= LEARNED_SCORE_THRESHOLD &&
    updates.weight > LEARNED_SCORE_THRESHOLD;
  const isNewlyFullyMastered =
    !card.masteredAt && updates.weight > LEARNED_SCORE_THRESHOLD && oppositeProgress.weight > LEARNED_SCORE_THRESHOLD;
  const updatedCard = await updateFlashcardReviewState(userId, cardId, body.direction, {
    ...updates,
    directionMasteredAt: isNewlyMastered ? updates.lastReviewedAt : null,
    cardMasteredAt: isNewlyFullyMastered ? updates.lastReviewedAt : null
  });

  if (!updatedCard) {
    throw new Error("Could not update flashcard");
  }

  return {
    updatedCard,
    nextCard: await getNextStudyCard(userId, [reviewKey(cardId, body.direction)]),
    stats: await getDeckStats(userId),
    masteredFlashcard: isNewlyMastered
      ? {
          id: updatedCard.id,
          text: getMasteredFlashcardText(updatedCard),
          direction: body.direction
        }
      : null
  };
}

export async function removeFlashcard(userId: number, cardId: number): Promise<DeleteFlashcardResponse> {
  const removed = await deleteFlashcard(userId, cardId);
  if (!removed) {
    throw new Error("Flashcard not found");
  }

  const lastServedReviewKey = lastServedReviewKeys.get(userId) ?? null;
  if (lastServedReviewKey?.startsWith(`${cardId}:`)) {
    lastServedReviewKeys.set(userId, null);
  }

  return {
    removedId: cardId,
    nextCard: await getNextStudyCard(userId),
    stats: await getDeckStats(userId)
  };
}
