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
  loadingAudioKey: string | null;
  autoSpeakHebrew: boolean;
  onReveal: () => void;
  onReview: (result: "oops" | "got_it") => void;
  onRemove: () => void;
  onToggleAutoSpeakHebrew: () => void;
  onSpeak: (key: string, text: string, language: AppLanguage) => void;
};

export function StudyPanel({
  uiLanguage,
  card,
  isRevealed,
  isBusy,
  pendingReviewResult,
  isRemoving,
  loadingAudioKey,
  autoSpeakHebrew,
  onReveal,
  onReview,
  onRemove,
  onToggleAutoSpeakHebrew,
  onSpeak
}: StudyPanelProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [card?.id, card?.reviewDirection]);

  const score = card ? card.directionWeight.toFixed(2) : null;
  const promptAudioKey = card ? `flashcard:${card.id}:prompt:${card.promptLanguage}:${card.promptText}` : null;
  const answerAudioKey = card ? `flashcard:${card.id}:answer:${card.answerLanguage}:${card.answerText}` : null;
  const canSpeakPrompt = card?.promptLanguage === "he";
  const canSpeakAnswer = card?.answerLanguage === "he";
  const promptTransliteration = card?.promptLanguage === "he" ? card.promptTransliteration : null;
  const answerTransliteration = card?.answerLanguage === "he" ? card.answerTransliteration : null;

  const renderAutoSpeakToggle = () => (
    <>
      <input type="checkbox" checked={autoSpeakHebrew} onChange={onToggleAutoSpeakHebrew} />
      <span>{t(uiLanguage, "autoSpeakHebrew")}</span>
    </>
  );

  return (
    <>
      <section className="panel review-panel">
        <div className="study-panel-header">
          <h2>{t(uiLanguage, "studyHeading")}</h2>
          <label className="auto-speak-toggle auto-speak-toggle-desktop">{renderAutoSpeakToggle()}</label>
        </div>

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
                    <div className="menu-description">
                      <span className="menu-description-label">{t(uiLanguage, "flashcardImageCue")}</span>
                      <p>{card.imagePrompt}</p>
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
                  <div className="revealed-stack">
                    <div className="revealed-result-line spoken-line">
                      <div className="answer-block">
                        <div className="card-text-stack">
                          <p className="revealed-answer-text" dir={card.answerLanguage === "he" ? "rtl" : "ltr"}>
                            {card.answerText}
                          </p>
                          {answerTransliteration ? <p className="transliteration-text">{answerTransliteration}</p> : null}
                        </div>
                      </div>
                      {canSpeakAnswer ? (
                        <button
                          className="icon-speak-button"
                          type="button"
                          aria-label={t(uiLanguage, "playAudio")}
                          title={t(uiLanguage, "playAudio")}
                          disabled={isBusy || !answerAudioKey || loadingAudioKey !== null}
                          onClick={() => answerAudioKey && onSpeak(answerAudioKey, card.answerText, card.answerLanguage)}
                        >
                          {loadingAudioKey === answerAudioKey ? (
                            <span className="button-spinner" aria-hidden="true" />
                          ) : (
                            <span aria-hidden="true">🔊</span>
                          )}
                        </button>
                      ) : null}
                    </div>
                    <div className="revealed-source-line spoken-line">
                      <div className="card-text-stack">
                        <p className="prompt-text prompt-text-revealed" dir={card.promptLanguage === "he" ? "rtl" : "ltr"}>
                          {card.promptText}
                        </p>
                        {promptTransliteration ? <p className="transliteration-text">{promptTransliteration}</p> : null}
                      </div>
                      {canSpeakPrompt ? (
                        <button
                          className="icon-speak-button"
                          type="button"
                          aria-label={t(uiLanguage, "playAudio")}
                          title={t(uiLanguage, "playAudio")}
                          disabled={isBusy || !promptAudioKey || loadingAudioKey !== null}
                          onClick={() => promptAudioKey && onSpeak(promptAudioKey, card.promptText, card.promptLanguage)}
                        >
                          {loadingAudioKey === promptAudioKey ? (
                            <span className="button-spinner" aria-hidden="true" />
                          ) : (
                            <span aria-hidden="true">🔊</span>
                          )}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="spoken-line spoken-line-centered">
                    <div className="card-text-stack">
                      <p className="prompt-text" dir={card.promptLanguage === "he" ? "rtl" : "ltr"}>
                        {card.promptText}
                      </p>
                      {promptTransliteration ? <p className="transliteration-text">{promptTransliteration}</p> : null}
                    </div>
                    {canSpeakPrompt ? (
                      <button
                        className="icon-speak-button"
                        type="button"
                        aria-label={t(uiLanguage, "playAudio")}
                        title={t(uiLanguage, "playAudio")}
                        disabled={isBusy || !promptAudioKey || loadingAudioKey !== null}
                        onClick={() => promptAudioKey && onSpeak(promptAudioKey, card.promptText, card.promptLanguage)}
                      >
                        {loadingAudioKey === promptAudioKey ? (
                          <span className="button-spinner" aria-hidden="true" />
                        ) : (
                          <span aria-hidden="true">🔊</span>
                        )}
                      </button>
                    ) : null}
                  </div>
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
      <label className="auto-speak-toggle auto-speak-toggle-mobile">{renderAutoSpeakToggle()}</label>
    </>
  );
}
