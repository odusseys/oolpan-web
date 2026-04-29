import type { AppLanguage, TranslationResult } from "@study/shared";
import { t } from "../lib/copy";

type TranslatorPanelProps = {
  uiLanguage: AppLanguage;
  sourceLanguage: AppLanguage;
  targetLanguage: AppLanguage;
  text: string;
  result: TranslationResult | null;
  isTranslating: boolean;
  isSaving: boolean;
  isSpeakingTranslation: boolean;
  onTextChange: (value: string) => void;
  onTranslate: () => void;
  onSwap: () => void;
  onSave: () => void;
  onSpeakTranslation: () => void;
};

export function TranslatorPanel({
  uiLanguage,
  sourceLanguage,
  targetLanguage,
  text,
  result,
  isTranslating,
  isSaving,
  isSpeakingTranslation,
  onTextChange,
  onTranslate,
  onSwap,
  onSave,
  onSpeakTranslation
}: TranslatorPanelProps) {
  const isHebrewInput = sourceLanguage === "he";
  const isHebrewOutput = targetLanguage === "he";

  return (
    <section className="panel translator-panel">
      <h2>{t(uiLanguage, "translateTab")}</h2>

      <div className="translate-stack">
        <div className="translation-surface translation-input-surface">
          <div className="surface-header">
            <div className="surface-language">{sourceLanguage === "en" ? "English" : "עברית"}</div>
            {isHebrewInput ? (
              <button
                className="icon-speak-button"
                type="button"
                aria-label={t(uiLanguage, "playAudio")}
                title={t(uiLanguage, "playAudio")}
                disabled={!text.trim() || isSpeakingTranslation}
                onClick={onSpeakTranslation}
              >
                {isSpeakingTranslation ? (
                  <span className="button-spinner" aria-hidden="true" />
                ) : (
                  <span aria-hidden="true">🔊</span>
                )}
              </button>
            ) : null}
          </div>
          <label className="field">
            <span className="sr-only">{t(uiLanguage, "phraseLabel")}</span>
            <textarea
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              placeholder={t(uiLanguage, isHebrewInput ? "phrasePlaceholderHe" : "phrasePlaceholderEn")}
              dir={isHebrewInput ? "rtl" : "ltr"}
              rows={5}
              maxLength={1000}
            />
          </label>
          <button className="primary-button inline-translate-button" type="button" onClick={onTranslate} disabled={!text.trim() || isTranslating}>
            <span className="button-content">
              {isTranslating ? <span className="button-spinner" aria-hidden="true" /> : null}
              <span>{isTranslating ? t(uiLanguage, "translating") : t(uiLanguage, "translateAction")}</span>
            </span>
          </button>
        </div>

        <div className="swap-row">
          <button className="swap-button" type="button" onClick={onSwap} aria-label={t(uiLanguage, "swap")}>
            ↕
          </button>
        </div>

        <div className="translation-surface translation-output">
          <div className="surface-header">
            <div className="surface-language">{targetLanguage === "en" ? "English" : "עברית"}</div>
            {isHebrewOutput && !isHebrewInput ? (
              <button
                className="icon-speak-button"
                type="button"
                aria-label={t(uiLanguage, "playAudio")}
                title={t(uiLanguage, "playAudio")}
                disabled={!result?.targetText.trim() || isSpeakingTranslation}
                onClick={onSpeakTranslation}
              >
                {isSpeakingTranslation ? (
                  <span className="button-spinner" aria-hidden="true" />
                ) : (
                  <span aria-hidden="true">🔊</span>
                )}
              </button>
            ) : null}
          </div>
          <textarea
            value={result?.targetText ?? ""}
            placeholder={t(uiLanguage, "translationPlaceholder")}
            dir={isHebrewOutput ? "rtl" : "ltr"}
            rows={5}
            readOnly
          />
        </div>
      </div>

      <div className="translate-actions translate-actions-single">
        <button className="secondary-button" type="button" onClick={onSave} disabled={!result || isSaving}>
          <span className="button-content">
            {isSaving ? <span className="button-spinner" aria-hidden="true" /> : null}
            <span>{isSaving ? t(uiLanguage, "addingFlashcard") : t(uiLanguage, "addFlashcard")}</span>
          </span>
        </button>
      </div>
    </section>
  );
}
