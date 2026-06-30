import type { FlashcardRecord } from "@study/shared";
import { describe, expect, it } from "vitest";
import { DEFAULT_ADAPTIVE_LEARNING_SCORE, applyReviewOutcome, computeSamplingWeight } from "./scheduler.js";

function makeCard(overrides: Partial<FlashcardRecord> = {}): FlashcardRecord {
  return {
    id: 1,
    sourceText: "book",
    sourceLanguage: "en",
    sourceTransliteration: null,
    sourcePluralText: null,
    sourcePluralTransliteration: null,
    targetText: "ספר",
    targetLanguage: "he",
    targetTransliteration: null,
    targetPluralText: null,
    targetPluralTransliteration: null,
    partOfSpeech: "noun",
    nounGender: "masculine",
    imagePrompt: "book on a table",
    imageData: null,
    weight: 1,
    reviewCount: 0,
    mistakeCount: 0,
    consecutiveCorrect: 0,
    sourceToTargetWeight: 1,
    sourceToTargetReviewCount: 0,
    sourceToTargetMistakeCount: 0,
    sourceToTargetConsecutiveCorrect: 0,
    sourceToTargetLastReviewedAt: null,
    sourceToTargetLastResult: null,
    sourceToTargetMasteredAt: null,
    targetToSourceWeight: 1,
    targetToSourceReviewCount: 0,
    targetToSourceMistakeCount: 0,
    targetToSourceConsecutiveCorrect: 0,
    targetToSourceLastReviewedAt: null,
    targetToSourceLastResult: null,
    targetToSourceMasteredAt: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
    lastReviewedAt: null,
    lastResult: null,
    masteredAt: null,
    isActive: true,
    ...overrides
  };
}

describe("scheduler", () => {
  it("starts new cards at the default adaptive score", () => {
    expect(DEFAULT_ADAPTIVE_LEARNING_SCORE).toBe(0.5);
  });

  it("decreases score after an oops", () => {
    const result = applyReviewOutcome(makeCard({ weight: 0.7 }), "oops", new Date("2026-04-02T00:00:00.000Z"));
    expect(result.weight).toBeLessThan(0.7);
    expect(result.consecutiveCorrect).toBe(0);
    expect(result.mistakeCount).toBe(1);
  });

  it("increases score after a correct answer", () => {
    const result = applyReviewOutcome(
      makeCard({ weight: 0.45, consecutiveCorrect: 3, reviewCount: 3 }),
      "got_it",
      new Date("2026-04-02T00:00:00.000Z")
    );
    expect(result.weight).toBeGreaterThan(0.45);
    expect(result.consecutiveCorrect).toBe(4);
  });

  it("uses the numerator offset and does not add one to the denominator", () => {
    const result = applyReviewOutcome(
      makeCard({ weight: 0.5, reviewCount: 3 }),
      "got_it",
      new Date("2026-04-02T00:00:00.000Z")
    );

    expect(result.weight).toBeCloseTo(0.8 * ((0.5 * 3 + 1 + 0.5) / 3) + 0.2);
  });

  it("does not clamp updated review scores", () => {
    const highResult = applyReviewOutcome(
      makeCard({ weight: 0.98, reviewCount: 10 }),
      "got_it",
      new Date("2026-04-02T00:00:00.000Z")
    );

    expect(highResult.weight).toBeGreaterThan(1);
  });

  it("bases sampling only on score", () => {
    const recentlyReviewed = computeSamplingWeight(
      makeCard({
        weight: 0.15,
        reviewCount: 1,
        lastReviewedAt: new Date("2026-04-02T00:04:30.000Z").toISOString(),
        lastResult: "oops"
      })
    );
    const olderReviewed = computeSamplingWeight(
      makeCard({
        weight: 0.15,
        reviewCount: 20,
        lastReviewedAt: new Date("2026-04-01T20:00:00.000Z").toISOString(),
        lastResult: "got_it"
      })
    );

    expect(recentlyReviewed).toBe(olderReviewed);
  });

  it("strongly favors poorly scored review directions", () => {
    const weak = computeSamplingWeight(makeCard({ weight: 0.15, reviewCount: 5 }));
    const strong = computeSamplingWeight(makeCard({ weight: 0.8, reviewCount: 5 }));

    expect(weak).toBeGreaterThan(strong * 8);
  });

  it("keeps mastered directions from swamping a smaller weak pool", () => {
    const weak = computeSamplingWeight(makeCard({ weight: 0.15, reviewCount: 5 }));
    const mastered = computeSamplingWeight(makeCard({ weight: 0.97, reviewCount: 20 }));
    const weakPoolSize = 10;
    const masteredPoolSize = 90;
    const weakPoolShare =
      (weak * weakPoolSize) / (weak * weakPoolSize + mastered * masteredPoolSize);

    expect(weak).toBeGreaterThan(mastered * 75);
    expect(weakPoolShare).toBeGreaterThan(0.9);
  });
});
