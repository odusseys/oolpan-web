import type { DirectedFlashcard, ReviewResult, ReviewStat } from "./types";

const DEFAULT_SCORE = 0.18;
const ERROR_EXPONENT = 2.75;
const WEAKNESS_MULTIPLIER = 11;
const LAST_ERROR_BOOST = 7;
const NEW_CARD_BOOST = 2.8;
const FLOOR_WEIGHT = 0.04;

export function createDefaultStat(key: string): ReviewStat {
  return {
    key,
    score: DEFAULT_SCORE,
    reviewCount: 0,
    mistakeCount: 0,
    streak: 0,
    lastResult: null,
    lastReviewedAt: null
  };
}

export function applyReview(stat: ReviewStat, result: ReviewResult, reviewedAt = Date.now()): ReviewStat {
  const reviewCount = stat.reviewCount + 1;
  const isOops = result === "oops";
  const streak = isOops ? 0 : stat.streak + 1;

  return {
    ...stat,
    score: isOops ? Math.max(0.01, stat.score * 0.3) : nextCorrectScore(stat.score, streak),
    reviewCount,
    mistakeCount: stat.mistakeCount + (isOops ? 1 : 0),
    streak,
    lastResult: result,
    lastReviewedAt: reviewedAt
  };
}

export function getStat(statsByKey: Map<string, ReviewStat>, key: string) {
  return statsByKey.get(key) ?? createDefaultStat(key);
}

export function sampleFlashcard(
  cards: DirectedFlashcard[],
  statsByKey: Map<string, ReviewStat>,
  previousKey: string | null
) {
  const weightedCards = cards.map((card) => {
    const stat = getStat(statsByKey, card.key);
    const repeatPenalty = card.key === previousKey ? 0.35 : 1;

    return {
      card,
      weight: computeSamplingWeight(stat) * repeatPenalty
    };
  });
  const totalWeight = weightedCards.reduce((total, item) => total + item.weight, 0);
  let cursor = Math.random() * totalWeight;

  for (const item of weightedCards) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item.card;
    }
  }

  return weightedCards[weightedCards.length - 1]?.card ?? null;
}

export function computeSamplingWeight(stat: ReviewStat, now = Date.now()) {
  const weakness = Math.pow(1.03 - stat.score, ERROR_EXPONENT) * WEAKNESS_MULTIPLIER;
  const mistakeRate = stat.mistakeCount / Math.max(1, stat.reviewCount);
  const recency = recencyMultiplier(stat.lastReviewedAt, now);
  const lastError = stat.lastResult === "oops" ? LAST_ERROR_BOOST : 0;
  const newCard = stat.reviewCount === 0 ? NEW_CARD_BOOST : 0;
  const streakDiscount = Math.min(stat.streak, 5) * 0.5;

  return Math.max(FLOOR_WEIGHT, (FLOOR_WEIGHT + weakness + lastError + newCard + mistakeRate * 3 - streakDiscount) * recency);
}

function nextCorrectScore(score: number, streak: number) {
  const recallGain = 0.16 + (1 - score) * 0.24 + Math.min(streak, 4) * 0.025;
  return Math.min(0.99, score + recallGain);
}

function recencyMultiplier(lastReviewedAt: number | null, now: number) {
  if (!lastReviewedAt) {
    return 1;
  }

  const elapsedSeconds = (now - lastReviewedAt) / 1000;
  if (elapsedSeconds < 10) {
    return 0.45;
  }
  if (elapsedSeconds < 45) {
    return 0.7;
  }
  if (elapsedSeconds < 180) {
    return 0.9;
  }

  return 1;
}
