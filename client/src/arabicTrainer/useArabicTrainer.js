import { useCallback, useEffect, useMemo, useState } from "react";
import { DIRECTED_FLASHCARDS, FLASHCARD_PAIRS, withRandomArabicPrompt } from "./deck";
import { loadReviewStats, saveReviewStat } from "./progressDb";
import { applyReview, getStat, sampleFlashcard } from "./scheduler";
export function useArabicTrainer() {
    const [statsByKey, setStatsByKey] = useState(() => new Map());
    const [currentCard, setCurrentCard] = useState(null);
    const [isRevealed, setIsRevealed] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [storageError, setStorageError] = useState(null);
    useEffect(() => {
        let isMounted = true;
        loadReviewStats()
            .then((loadedStats) => {
            if (!isMounted) {
                return;
            }
            setStatsByKey(loadedStats);
            setCurrentCard(nextCard(loadedStats, null));
            setIsLoaded(true);
        })
            .catch((error) => {
            if (!isMounted) {
                return;
            }
            setStorageError(error instanceof Error ? error.message : "Could not open IndexedDB.");
            setCurrentCard(nextCard(new Map(), null));
            setIsLoaded(true);
        });
        return () => {
            isMounted = false;
        };
    }, []);
    const currentStat = currentCard ? getStat(statsByKey, currentCard.key) : null;
    const summary = useMemo(() => getProgressSummary(statsByKey), [statsByKey]);
    const reveal = useCallback(() => setIsRevealed(true), []);
    const review = useCallback((result) => {
        if (!currentCard) {
            return;
        }
        setStatsByKey((currentStats) => {
            const updatedStats = new Map(currentStats);
            const updatedStat = applyReview(getStat(currentStats, currentCard.key), result);
            updatedStats.set(currentCard.key, updatedStat);
            setCurrentCard(nextCard(updatedStats, currentCard.key));
            setIsRevealed(false);
            void saveReviewStat(updatedStat).catch((error) => {
                setStorageError(error instanceof Error ? error.message : "Could not save progress.");
            });
            return updatedStats;
        });
    }, [currentCard]);
    return {
        currentCard,
        currentStat,
        isLoaded,
        isRevealed,
        storageError,
        summary,
        reveal,
        review
    };
}
function nextCard(statsByKey, previousKey) {
    const card = sampleFlashcard(DIRECTED_FLASHCARDS, statsByKey, previousKey);
    return card ? withRandomArabicPrompt(card) : null;
}
function getProgressSummary(statsByKey) {
    let reviewedDirections = 0;
    let totalReviews = 0;
    let weakDirections = 0;
    let masteredDirections = 0;
    for (const card of DIRECTED_FLASHCARDS) {
        const stat = getStat(statsByKey, card.key);
        reviewedDirections += stat.reviewCount > 0 ? 1 : 0;
        totalReviews += stat.reviewCount;
        weakDirections += stat.score < 0.42 ? 1 : 0;
        masteredDirections += stat.score > 0.86 && stat.streak >= 2 ? 1 : 0;
    }
    return {
        pairCount: FLASHCARD_PAIRS.length,
        directionCount: DIRECTED_FLASHCARDS.length,
        reviewedDirections,
        totalReviews,
        weakDirections,
        masteredDirections
    };
}
