import { ARABIC_FORM_IDS, ARABIC_FORM_LABELS } from "./deck";
import type { DirectedFlashcard, ReviewResult, ReviewStat } from "./types";

type FlashcardViewProps = {
  card: DirectedFlashcard | null;
  stat: ReviewStat | null;
  isLoaded: boolean;
  isRevealed: boolean;
  onReveal: () => void;
  onReview: (result: ReviewResult) => void;
};

export function FlashcardView({ card, stat, isLoaded, isRevealed, onReveal, onReview }: FlashcardViewProps) {
  if (!isLoaded || !card || !stat) {
    return (
      <section className="flashcard-panel" aria-busy="true">
        <div className="flashcard-surface loading-surface">Loading deck...</div>
      </section>
    );
  }

  return (
    <section className="flashcard-panel" aria-label="Arabic vocalization flashcard">
      <div className="card-meta">
        <span>{card.direction === "arabic_to_english" ? "Arabic to English" : "English to Arabic"}</span>
        <span>
          {card.arabicForm ? `${ARABIC_FORM_LABELS[card.arabicForm]} / ` : ""}
          {card.pair.vocalization.name}
        </span>
      </div>

      <div className="flashcard-surface">
        <div className={card.promptLanguage === "arabic" ? "prompt arabic-prompt" : "prompt english-prompt"} dir={card.promptLanguage === "arabic" ? "rtl" : "ltr"}>
          {card.promptText}
        </div>
        {isRevealed ? (
          <div className="answer-block">
            <span className="answer-label">Answer</span>
            <Answer card={card} />
          </div>
        ) : null}
      </div>

      <div className="review-strip">
        <div>
          <span className="metric-label">Score</span>
          <strong>{Math.round(stat.score * 100)}%</strong>
        </div>
        <div>
          <span className="metric-label">Reviews</span>
          <strong>{stat.reviewCount}</strong>
        </div>
        <div>
          <span className="metric-label">Mistakes</span>
          <strong>{stat.mistakeCount}</strong>
        </div>
      </div>

      {!isRevealed ? (
        <button className="primary-action" type="button" onClick={onReveal}>
          Guess
        </button>
      ) : (
        <div className="review-actions" aria-label="Review result">
          <button className="oops-action" type="button" onClick={() => onReview("oops")}>
            Oops
          </button>
          <button className="got-action" type="button" onClick={() => onReview("got_it")}>
            Got it
          </button>
        </div>
      )}
    </section>
  );
}

function Answer({ card }: { card: DirectedFlashcard }) {
  if (card.promptLanguage === "arabic") {
    return (
      <div className="answer english-answer" dir="ltr">
        {card.answerText}
      </div>
    );
  }

  return (
    <div className="form-answer-grid" dir="rtl">
      {ARABIC_FORM_IDS.map((form) => (
        <div className="form-answer-card" key={form}>
          <strong>{ARABIC_FORM_LABELS[form]}</strong>
          <span className="arabic-answer">{card.pair.arabicForms[form]}</span>
        </div>
      ))}
    </div>
  );
}
