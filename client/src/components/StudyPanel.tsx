import type { AppLanguage, StudyCard } from "@study/shared";
import { useEffect, useState } from "react";
import { t } from "../lib/copy";

type StudyPanelProps = {
  uiLanguage: AppLanguage;
  card: StudyCard | null;
  isRevealed: boolean;
  isBusy: boolean;
  pendingReviewResult: "oops" | "got_it" | null;
  isRemoving: boolean;
  onReveal: () => void;
  onReview: (result: "oops" | "got_it") => void;
  onRemove: () => void;
};

export function StudyPanel({
  uiLanguage,
  card,
  isRevealed,
  isBusy,
  pendingReviewResult,
  isRemoving,
  onReveal,
  onReview,
  onRemove
}: StudyPanelProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [card?.id]);

  const score = card ? card.weight.toFixed(2) : null;

  return (
    <section className="panel review-panel">
      <h2>{t(uiLanguage, "studyHeading")}</h2>

      {!card ? (
        <div className="empty-state">{t(uiLanguage, "studyEmpty")}</div>
      ) : (
        <div className="study-card-shell">
          <div className="study-card">
            <div className="study-card-menu">
              <button
                className="menu-trigger"
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((current) => !current)}
              >
                ⋯
              </button>

              {menuOpen ? (
                <div className="menu-popover" role="menu">
                  <div className="menu-metric">
                    <span>{t(uiLanguage, "flashcardScore")}</span>
                    <strong>{score}</strong>
                  </div>
                  <button className="menu-action" type="button" disabled={isBusy} onClick={onRemove}>
                    <span className="button-content">
                      {isRemoving ? <span className="button-spinner" aria-hidden="true" /> : null}
                      <span>{t(uiLanguage, "removeFlashcard")}</span>
                    </span>
                  </button>
                </div>
              ) : null}
            </div>

            {card.imageUrl ? <img className="card-image" src={card.imageUrl} alt={card.imagePrompt} /> : null}

            <div className="prompt-block">
              {isRevealed ? (
                <div className="revealed-compare">
                  <div className="revealed-column">
                    <p className="prompt-text prompt-text-revealed" dir={card.promptLanguage === "he" ? "rtl" : "ltr"}>
                      {card.promptText}
                    </p>
                  </div>
                  <div className="revealed-divider" aria-hidden="true" />
                  <div className="revealed-column">
                    <div className="answer-block">
                      <p dir={card.answerLanguage === "he" ? "rtl" : "ltr"}>{card.answerText}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="prompt-text" dir={card.promptLanguage === "he" ? "rtl" : "ltr"}>
                  {card.promptText}
                </p>
              )}
            </div>
          </div>

          {!isRevealed ? (
            <button className="primary-button" type="button" onClick={onReveal}>
              {t(uiLanguage, "showAnswer")}
            </button>
          ) : (
            <div className="review-actions">
              <button className="danger-button" type="button" disabled={isBusy} onClick={() => onReview("oops")}>
                <span className="button-content">
                  {pendingReviewResult === "oops" ? <span className="button-spinner" aria-hidden="true" /> : null}
                  <span>{t(uiLanguage, "oops")}</span>
                </span>
              </button>
              <button className="success-button" type="button" disabled={isBusy} onClick={() => onReview("got_it")}>
                <span className="button-content">
                  {pendingReviewResult === "got_it" ? <span className="button-spinner" aria-hidden="true" /> : null}
                  <span>{t(uiLanguage, "gotIt")}</span>
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
