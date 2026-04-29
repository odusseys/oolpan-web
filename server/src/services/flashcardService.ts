import type {
  AppLanguage,
  CreateFlashcardRequest,
  DeleteFlashcardResponse,
  ReviewRequest,
  ReviewResponse,
  SpeechRequest,
  StudyCard,
  SuggestionsResponse
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

function toImageUrl(imageData: string | null) {
  return imageData;
}

function toStudyCard(card: NonNullable<ReturnType<typeof getFlashcardById>>): StudyCard {
  const promptSide = Math.random() > 0.5 ? "source" : "target";

  return {
    ...card,
    promptSide,
    promptText: promptSide === "source" ? card.sourceText : card.targetText,
    promptLanguage: promptSide === "source" ? card.sourceLanguage : card.targetLanguage,
    answerText: promptSide === "source" ? card.targetText : card.sourceText,
    answerLanguage: promptSide === "source" ? card.targetLanguage : card.sourceLanguage,
    imageUrl: toImageUrl(card.imageData),
    samplingWeight: 0
  };
}

export async function createFlashcardWithImage(userId: number, input: CreateFlashcardRequest) {
  const existing = findFlashcardByPhrase(userId, input);
  if (existing?.imageData && existing.isActive) {
    return {
      card: existing,
      stats: getDeckStats(userId)
    };
  }

  const imagePrompt =
    input.imagePrompt ?? existing?.imagePrompt ?? (await aiClient.describeFlashcardScene({
      sourceText: input.sourceText,
      sourceLanguage: input.sourceLanguage,
      targetText: input.targetText,
      targetLanguage: input.targetLanguage
    }));
  const generated = existing?.imageData ? null : await aiClient.generateIllustration(imagePrompt);
  const saved = createFlashcard(userId, { ...input, imagePrompt }, generated?.dataUrl ?? null);

  if (!saved) {
    throw new Error("Could not create flashcard");
  }

  return {
    card: saved,
    stats: getDeckStats(userId)
  };
}

export function getNextStudyCard(userId: number, excludedIds: number[] = []) {
  const cards = listFlashcards(userId);
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

export function getStudyStats(userId: number) {
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
  variationHint?: string
): Promise<SuggestionsResponse> {
  const recent = listRecentFlashcards(userId, 5);
  if (recent.length === 0) {
    return { suggestions: [], basedOnCount: 0 };
  }

  const suggestions = await aiClient.suggestRelatedFlashcards(recent, sourceLanguage, targetLanguage, variationHint);
  return {
    suggestions,
    basedOnCount: recent.length
  };
}

export function reviewCard(userId: number, cardId: number, body: ReviewRequest): ReviewResponse {
  const card = getFlashcardById(userId, cardId);
  if (!card) {
    throw new Error("Flashcard not found");
  }

  const updates = applyReviewOutcome(card, body.result);
  const updatedCard = updateFlashcardReviewState(userId, cardId, updates);

  if (!updatedCard) {
    throw new Error("Could not update flashcard");
  }

  return {
    updatedCard,
    nextCard: getNextStudyCard(userId, [cardId]),
    stats: getDeckStats(userId)
  };
}

export function removeFlashcard(userId: number, cardId: number): DeleteFlashcardResponse {
  const removed = deleteFlashcard(userId, cardId);
  if (!removed) {
    throw new Error("Flashcard not found");
  }

  if ((lastServedFlashcardIds.get(userId) ?? null) === cardId) {
    lastServedFlashcardIds.set(userId, null);
  }

  return {
    removedId: cardId,
    nextCard: getNextStudyCard(userId, [cardId]),
    stats: getDeckStats(userId)
  };
}
