import { sampleMultipleByScore } from "./scheduler.js";

type ReviewQueueCandidate = {
  card: {
    id: number;
  };
  samplingWeight: number;
};

export function excludeLastServedCard<T extends ReviewQueueCandidate>(
  candidates: T[],
  lastServedCardId: number | null | undefined
) {
  if (lastServedCardId == null) {
    return candidates;
  }

  return candidates.filter((candidate) => candidate.card.id !== lastServedCardId);
}

export function pickNextReviewCandidate<T extends ReviewQueueCandidate>(
  candidates: T[],
  lastServedCardId: number | null | undefined
) {
  const eligibleCandidates = excludeLastServedCard(candidates, lastServedCardId);
  return sampleMultipleByScore(eligibleCandidates, (candidate) => candidate.samplingWeight, 1)[0] ?? null;
}
