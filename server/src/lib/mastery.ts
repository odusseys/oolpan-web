import { LEARNED_SCORE_THRESHOLD } from "@study/shared";

type MasteryProgress = {
  weight: number;
  masteredAt: string | null;
};

type ReviewUpdate = {
  weight: number;
  lastReviewedAt: string;
};

export function getReviewMasteryChange(
  card: { masteredAt: string | null },
  reviewedDirection: MasteryProgress,
  oppositeDirection: Pick<MasteryProgress, "weight">,
  update: ReviewUpdate
) {
  const directionBecameMastered =
    reviewedDirection.weight <= LEARNED_SCORE_THRESHOLD && update.weight > LEARNED_SCORE_THRESHOLD;
  const wasLearnedWord =
    reviewedDirection.weight > LEARNED_SCORE_THRESHOLD && oppositeDirection.weight > LEARNED_SCORE_THRESHOLD;
  const isLearnedWord =
    update.weight > LEARNED_SCORE_THRESHOLD && oppositeDirection.weight > LEARNED_SCORE_THRESHOLD;
  const wordBecameLearned = !wasLearnedWord && isLearnedWord;
  const shouldNotifyLearnedWord = !card.masteredAt && wordBecameLearned;

  return {
    directionMasteredAt: !reviewedDirection.masteredAt && directionBecameMastered ? update.lastReviewedAt : null,
    cardMasteredAt: shouldNotifyLearnedWord ? update.lastReviewedAt : null,
    shouldNotifyLearnedWord
  };
}
