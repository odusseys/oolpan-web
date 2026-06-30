import type { FlashcardRecord, ReviewResult } from "@study/shared";

export const DEFAULT_ADAPTIVE_LEARNING_SCORE = 0.5;
export const DEFAULT_ADAPTIVE_INITIAL_TRIALS = 3;

const SCORE_DECAY_FACTOR = 0.8;
const SCORE_UPDATE_NUMERATOR_OFFSET = DEFAULT_ADAPTIVE_LEARNING_SCORE;
const SCORE_SAMPLING_EXPONENT = 1.7;
const SCORE_SAMPLING_MULTIPLIER = 2;
const MIN_SAMPLING_WEIGHT = 0.015;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function computeNewScore(score: number, trials: number, success: boolean) {
  const added = success ? 1 : 0;
  const rawNewScore = (score * trials + added + SCORE_UPDATE_NUMERATOR_OFFSET) / trials;
  return SCORE_DECAY_FACTOR * rawNewScore + (1 - SCORE_DECAY_FACTOR) * added;
}

type ReviewProgress = Pick<
  FlashcardRecord,
  "weight" | "reviewCount" | "mistakeCount" | "consecutiveCorrect"
>;

type SamplingProgress = Pick<FlashcardRecord, "weight">;

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

export function applyReviewOutcome(progress: ReviewProgress, result: ReviewResult, now = new Date()) {
  const success = result === "got_it";
  const effectiveTrials = Math.max(progress.reviewCount, DEFAULT_ADAPTIVE_INITIAL_TRIALS);
  const nextReviewCount = progress.reviewCount + 1;
  const nextScore = computeNewScore(progress.weight, effectiveTrials, success);

  return {
    weight: nextScore,
    reviewCount: nextReviewCount,
    mistakeCount: success ? progress.mistakeCount : progress.mistakeCount + 1,
    consecutiveCorrect: success ? progress.consecutiveCorrect + 1 : 0,
    lastReviewedAt: now.toISOString(),
    lastResult: result
  };
}

export function computeSamplingWeight(progress: SamplingProgress) {
  const masteryGap = clamp(1 - progress.weight, 0.04, 1);
  return clamp(
    Math.pow(masteryGap, SCORE_SAMPLING_EXPONENT) * SCORE_SAMPLING_MULTIPLIER,
    MIN_SAMPLING_WEIGHT,
    2.4
  );
}

export function pickWeightedRandom(cards: FlashcardRecord[], excludedIds: number[] = []) {
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
    samplingWeight: computeSamplingWeight(card)
  }));
  const picked = sampleMultipleByScore(weightedCards, (entry) => entry.samplingWeight, 1)[0];
  if (!picked) {
    return null;
  }

  return picked;
}
