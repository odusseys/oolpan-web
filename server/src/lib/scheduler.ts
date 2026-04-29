import type { FlashcardRecord, ReviewResult } from "@study/shared";

export const DEFAULT_ADAPTIVE_LEARNING_SCORE = 0.2;
export const DEFAULT_ADAPTIVE_INITIAL_TRIALS = 3;

const SCORE_DECAY_FACTOR = 0.8;
const MIN_SCORE = 0.02;
const MAX_SCORE = 0.98;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function minutesSince(isoDate: string | null, now: Date) {
  if (!isoDate) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, (now.getTime() - new Date(isoDate).getTime()) / 60000);
}

function computeNewScore(score: number, trials: number, success: boolean) {
  const added = success ? 1 : 0;
  const rawNewScore = (score * trials + added) / (trials + 1);
  return clamp(SCORE_DECAY_FACTOR * rawNewScore + (1 - SCORE_DECAY_FACTOR) * added, MIN_SCORE, MAX_SCORE);
}

export function sampleMultipleByScore<T>(items: T[], score: (item: T) => number, nSamples = 1): T[] {
  const candidates = [...items];
  const weights = candidates.map((item) => Math.max(0, score(item)));
  const sampled: T[] = [];
  const totalSamples = Math.min(nSamples, candidates.length);

  for (let sampleIndex = 0; sampleIndex < totalSamples; sampleIndex += 1) {
    const cumulativeWeights: number[] = [];
    const totalWeight = weights.reduce((accumulator, weight, index) => {
      cumulativeWeights[index] = accumulator + weight;
      return cumulativeWeights[index];
    }, 0);

    if (totalWeight <= 0) {
      break;
    }

    const randomValue = Math.random() * totalWeight;
    const selectedIndex = cumulativeWeights.findIndex((cumulativeWeight) => randomValue <= cumulativeWeight);
    const index = selectedIndex === -1 ? candidates.length - 1 : selectedIndex;
    const selectedItem = candidates[index];

    if (!selectedItem) {
      break;
    }

    sampled.push(selectedItem);
    candidates.splice(index, 1);
    weights.splice(index, 1);
  }

  return sampled;
}

export function applyReviewOutcome(card: FlashcardRecord, result: ReviewResult, now = new Date()) {
  const success = result === "got_it";
  const effectiveTrials = Math.max(card.reviewCount, DEFAULT_ADAPTIVE_INITIAL_TRIALS);
  const nextReviewCount = card.reviewCount + 1;
  const nextScore = computeNewScore(card.weight, effectiveTrials, success);

  return {
    weight: nextScore,
    reviewCount: nextReviewCount,
    mistakeCount: success ? card.mistakeCount : card.mistakeCount + 1,
    consecutiveCorrect: success ? card.consecutiveCorrect + 1 : 0,
    lastReviewedAt: now.toISOString(),
    lastResult: result
  };
}

export function computeSamplingWeight(card: FlashcardRecord, now = new Date()) {
  const recencyMinutes = minutesSince(card.lastReviewedAt, now);
  const noveltyMultiplier = card.reviewCount < DEFAULT_ADAPTIVE_INITIAL_TRIALS ? 1.35 : 1;
  const strugglingBoost = card.lastResult === "oops" ? 1.25 : 1;
  const ageBoost = Number.isFinite(recencyMinutes)
    ? clamp(1 + recencyMinutes / (60 * 24), 1, 2.4)
    : 1.3;
  const masteryNeed = clamp(1.15 - card.weight, 0.08, 1.2);

  let recencyPenalty = 1;
  if (recencyMinutes < 1) {
    recencyPenalty = 0.08;
  } else if (recencyMinutes < 3) {
    recencyPenalty = 0.18;
  } else if (recencyMinutes < 10) {
    recencyPenalty = 0.45;
  } else if (recencyMinutes < 30) {
    recencyPenalty = 0.72;
  }

  return clamp(masteryNeed * noveltyMultiplier * strugglingBoost * ageBoost * recencyPenalty, 0.08, 30);
}

export function pickWeightedRandom(cards: FlashcardRecord[], now = new Date(), excludedIds: number[] = []) {
  if (cards.length === 0) {
    return null;
  }

  const exclusionSet = new Set(excludedIds);
  const eligibleCards = cards.filter((card) => !exclusionSet.has(card.id));
  if (eligibleCards.length === 0) {
    return null;
  }

  const weightedCards = eligibleCards.map((card) => ({
    card,
    samplingWeight: computeSamplingWeight(card, now)
  }));
  const picked = sampleMultipleByScore(weightedCards, (entry) => entry.samplingWeight, 1)[0];
  if (!picked) {
    return null;
  }

  return picked;
}
