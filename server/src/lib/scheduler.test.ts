import type { FlashcardRecord } from "@study/shared";
import { describe, expect, it } from "vitest";
import { applyReviewOutcome, computeSamplingWeight } from "./scheduler.js";

function makeCard(overrides: Partial<FlashcardRecord> = {}): FlashcardRecord {
  return {
    id: 1,
    sourceText: "book",
    sourceLanguage: "en",
    targetText: "ספר",
    targetLanguage: "he",
    partOfSpeech: "noun",
    nounGender: "masculine",
    imagePrompt: "book on a table",
    imageData: null,
    weight: 1,
    reviewCount: 0,
    mistakeCount: 0,
    consecutiveCorrect: 0,
    createdAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
    lastReviewedAt: null,
    lastResult: null,
    isActive: true,
    ...overrides
  };
}

describe("scheduler", () => {
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

  it("suppresses immediate repeats", () => {
    const now = new Date("2026-04-02T00:05:00.000Z");
    const fresh = computeSamplingWeight(
      makeCard({
        weight: 0.15,
        reviewCount: 4,
        lastReviewedAt: new Date("2026-04-02T00:04:30.000Z").toISOString(),
        lastResult: "oops"
      }),
      now
    );
    const older = computeSamplingWeight(
      makeCard({
        weight: 0.15,
        reviewCount: 4,
        lastReviewedAt: new Date("2026-04-01T20:00:00.000Z").toISOString(),
        lastResult: "oops"
      }),
      now
    );
    expect(fresh).toBeLessThan(older);
  });
});
