import { describe, expect, it } from "vitest";
import { excludeLastServedCard, pickNextReviewCandidate } from "./reviewQueue.js";

function candidate(cardId: number, direction: "source_to_target" | "target_to_source", samplingWeight = 1) {
  return {
    card: { id: cardId },
    direction,
    samplingWeight
  };
}

describe("reviewQueue", () => {
  it("excludes the last served card across both directions", () => {
    const candidates = [
      candidate(1, "source_to_target"),
      candidate(1, "target_to_source"),
      candidate(2, "source_to_target")
    ];

    expect(excludeLastServedCard(candidates, 1)).toEqual([candidate(2, "source_to_target")]);
  });

  it("does not fall back to the same card when it is the only eligible word", () => {
    const candidates = [candidate(1, "source_to_target"), candidate(1, "target_to_source")];

    expect(pickNextReviewCandidate(candidates, 1)).toBeNull();
  });

  it("samples from remaining candidates when another word is available", () => {
    const candidates = [
      candidate(1, "source_to_target"),
      candidate(1, "target_to_source"),
      candidate(2, "source_to_target")
    ];

    expect(pickNextReviewCandidate(candidates, 1)?.card.id).toBe(2);
  });
});
