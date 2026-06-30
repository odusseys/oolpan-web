import { describe, expect, it } from "vitest";
import { getReviewMasteryChange } from "./mastery.js";

const reviewedAt = "2026-06-12T08:00:00.000Z";

describe("mastery transitions", () => {
  it("marks a reviewed direction without notifying the word when the opposite direction is not learned", () => {
    const change = getReviewMasteryChange(
      { masteredAt: null },
      { weight: 0.85, masteredAt: null },
      { weight: 0.2 },
      { weight: 0.92, lastReviewedAt: reviewedAt }
    );

    expect(change.directionMasteredAt).toBe(reviewedAt);
    expect(change.cardMasteredAt).toBeNull();
    expect(change.shouldNotifyLearnedWord).toBe(false);
  });

  it("notifies the word when the review makes both directions learned", () => {
    const change = getReviewMasteryChange(
      { masteredAt: null },
      { weight: 0.85, masteredAt: null },
      { weight: 0.95 },
      { weight: 0.92, lastReviewedAt: reviewedAt }
    );

    expect(change.directionMasteredAt).toBe(reviewedAt);
    expect(change.cardMasteredAt).toBe(reviewedAt);
    expect(change.shouldNotifyLearnedWord).toBe(true);
  });

  it("does not notify a word that was already counted as learned", () => {
    const change = getReviewMasteryChange(
      { masteredAt: null },
      { weight: 0.95, masteredAt: reviewedAt },
      { weight: 0.95 },
      { weight: 0.97, lastReviewedAt: "2026-06-13T08:00:00.000Z" }
    );

    expect(change.directionMasteredAt).toBeNull();
    expect(change.cardMasteredAt).toBeNull();
    expect(change.shouldNotifyLearnedWord).toBe(false);
  });
});
