import {
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
  getLastServedFlashcardId,
  listRecentFlashcards,
  listFlashcards,
  setLastServedFlashcardId,
  updateFlashcardReviewState,
  withUserStudyStateLock
} from "../db/repository.js";
import { getReviewMasteryChange } from "../lib/mastery.js";
import { pickNextReviewCandidate } from "../lib/reviewQueue.js";
import { applyReviewOutcome, computeSamplingWeight } from "../lib/scheduler.js";
import { createAiClient } from "./aiClient.js";

const aiClient = createAiClient();

type RequiredFlashcardPluralization = {
  sourcePluralText: string;
  targetPluralText: string;
};

function toImageUrl(imageData: string | null) {
  return imageData;
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

function getReviewCandidates(cards: FlashcardRecord[]) {
  return cards.flatMap((card) =>
    (["source_to_target", "target_to_source"] as const).map((direction) => {
      const progress = getDirectionProgress(card, direction);
      return {
        card,
        direction,
        samplingWeight: computeSamplingWeight(progress)
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

function getMasteredFlashcardText(card: FlashcardRecord) {
  if (card.targetLanguage === "he") {
    return card.targetText;
  }

  if (card.sourceLanguage === "he") {
    return card.sourceText;
  }

  return card.targetText;
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

async function getImagePrompt(input: CreateFlashcardRequest, existing: FlashcardRecord | null) {
  if (input.imagePrompt?.trim()) {
    return input.imagePrompt.trim();
  }

  if (existing?.imagePrompt?.trim()) {
    return existing.imagePrompt.trim();
  }

  return aiClient.describeFlashcardScene({
    sourceText: input.sourceText,
    sourceLanguage: input.sourceLanguage,
    targetText: input.targetText,
    targetLanguage: input.targetLanguage
  });
}

function optionalText(value?: string | null) {
  return value?.trim() || null;
}

export async function createFlashcardWithImage(userId: number, input: CreateFlashcardRequest) {
  const complementExpandedInput = await aiClient.expandVerbComplement(input);
  const normalizedInput = {
    ...input,
    sourceText: complementExpandedInput.sourceText.trim(),
    targetText: complementExpandedInput.targetText.trim(),
    sourcePluralText: null,
    targetPluralText: null,
    sourcePluralTransliteration: null,
    targetPluralTransliteration: null
  };
  const existing = await findFlashcardByPhrase(userId, normalizedInput);
  if (existing?.imageData && existing.isActive) {
    return {
      card: existing,
      stats: await getDeckStats(userId)
    };
  }

  const imagePromptPromise = getImagePrompt(normalizedInput, existing);
  const pluralizationPromise = getPluralization(normalizedInput);
  const generatedPromise = existing?.imageData
    ? Promise.resolve(null)
    : imagePromptPromise.then((imagePrompt) => aiClient.generateIllustration(imagePrompt));
  const [imagePrompt, pluralization, generated] = await Promise.all([
    imagePromptPromise,
    pluralizationPromise,
    generatedPromise
  ]);
  const saved = await createFlashcard(
    userId,
    {
      ...normalizedInput,
      imagePrompt,
      sourceTransliteration: optionalText(normalizedInput.sourceTransliteration),
      targetTransliteration: optionalText(normalizedInput.targetTransliteration),
      sourcePluralText: pluralization?.sourcePluralText ?? null,
      targetPluralText: pluralization?.targetPluralText ?? null,
      sourcePluralTransliteration: null,
      targetPluralTransliteration: null
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

export async function getNextStudyCard(userId: number, excludedCardId?: number | null) {
  return withUserStudyStateLock(userId, async (sql) => {
    const cards = await listFlashcards(userId, sql);
    const lastServedCardId = await getLastServedFlashcardId(userId, sql);
    const candidates = getReviewCandidates(cards);
    const picked = pickNextReviewCandidate(candidates, excludedCardId ?? lastServedCardId);
    if (!picked) {
      if (excludedCardId != null) {
        await setLastServedFlashcardId(userId, excludedCardId, sql);
      }
      return null;
    }

    const card = toStudyCard(picked.card, picked.direction);
    card.samplingWeight = picked.samplingWeight;
    await setLastServedFlashcardId(userId, card.id, sql);
    return card;
  });
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
  const masteryChange = getReviewMasteryChange(card, directionProgress, oppositeProgress, updates);
  const updatedCard = await updateFlashcardReviewState(userId, cardId, body.direction, {
    ...updates,
    directionMasteredAt: masteryChange.directionMasteredAt,
    cardMasteredAt: masteryChange.cardMasteredAt
  });

  if (!updatedCard) {
    throw new Error("Could not update flashcard");
  }

  return {
    updatedCard,
    nextCard: await getNextStudyCard(userId, cardId),
    stats: await getDeckStats(userId),
    masteredFlashcard: masteryChange.shouldNotifyLearnedWord
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

  return {
    removedId: cardId,
    nextCard: await getNextStudyCard(userId, cardId),
    stats: await getDeckStats(userId)
  };
}
