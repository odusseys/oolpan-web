import { useState } from "react";
import { FlashcardView } from "./FlashcardView";
import { LetterChartModal } from "./LetterChartModal";
import { ProgressPanel } from "./ProgressPanel";
import { useArabicTrainer } from "./useArabicTrainer";

export default function ArabicLetterTrainer() {
  const [isChartOpen, setIsChartOpen] = useState(false);
  const { currentCard, currentStat, isLoaded, isRevealed, storageError, summary, reveal, review } = useArabicTrainer();

  return (
    <main className="arabic-trainer-root">
      <header className="app-header">
        <div>
          <p className="eyebrow">Arabic vocalization trainer</p>
          <h1>Letter flashcards</h1>
        </div>
      </header>

      <div className="trainer-layout">
        <FlashcardView
          card={currentCard}
          stat={currentStat}
          isLoaded={isLoaded}
          isRevealed={isRevealed}
          onReveal={reveal}
          onReview={review}
        />
        <ProgressPanel summary={summary} storageError={storageError} onOpenChart={() => setIsChartOpen(true)} />
      </div>

      <LetterChartModal isOpen={isChartOpen} onClose={() => setIsChartOpen(false)} />
    </main>
  );
}
