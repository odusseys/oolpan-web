import type { AppLanguage, TranslationResult } from "@study/shared";
import { useEffect, useLayoutEffect, useRef } from "react";
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
  onSwap: () => void;
  onSave: () => void;
  onSpeakTranslation: () => void;
};

const TRANSLATION_TEXTAREA_MIN_HEIGHT = 120;

function resizeTranslationTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) {
    return;
  }

  textarea.style.height = `${TRANSLATION_TEXTAREA_MIN_HEIGHT}px`;
  textarea.style.height = `${Math.max(TRANSLATION_TEXTAREA_MIN_HEIGHT, textarea.scrollHeight)}px`;
}

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
  onSwap,
  onSave,
  onSpeakTranslation
}: TranslatorPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const outputRef = useRef<HTMLTextAreaElement | null>(null);
  const isHebrewInput = sourceLanguage === "he";
  const isHebrewOutput = targetLanguage === "he";
  const sourceText = text.trim();
  const targetText = result?.targetText.trim() ?? "";
  const outputText = isTranslating ? "" : (result?.targetText ?? "");
  const canSpeakInput = isHebrewInput && sourceText.length > 0;
  const canSpeakOutput = isHebrewOutput && !isHebrewInput && targetText.length > 0;

  useEffect(() => {
    if (window.matchMedia("(max-width: 980px)").matches) {
      inputRef.current?.focus();
    }
  }, []);

  useLayoutEffect(() => {
    resizeTranslationTextarea(inputRef.current);
  }, [sourceLanguage, text]);

  useLayoutEffect(() => {
    resizeTranslationTextarea(outputRef.current);
  }, [isTranslating, outputText, targetLanguage]);

  return (
    <section className="panel translator-panel">
      <h2>{t(uiLanguage, "translateTab")}</h2>

      <div className="translate-stack">
        <div className="translation-surface translation-input-surface">
          <div className={isHebrewInput ? "surface-header surface-header-rtl" : "surface-header"}>
            <div className="surface-language">{sourceLanguage === "en" ? "English" : "עברית"}</div>
          </div>
          <label className="field">
            <span className="sr-only">{t(uiLanguage, "phraseLabel")}</span>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              placeholder={t(uiLanguage, isHebrewInput ? "phrasePlaceholderHe" : "phrasePlaceholderEn")}
              dir={isHebrewInput ? "rtl" : "ltr"}
              rows={5}
              maxLength={1000}
            />
          </label>
          {canSpeakInput ? (
            <div className="surface-action-row">
              <button
                className="icon-speak-button"
                type="button"
                aria-label={t(uiLanguage, "playAudio")}
                title={t(uiLanguage, "playAudio")}
                disabled={isSpeakingTranslation}
                onClick={onSpeakTranslation}
              >
                {isSpeakingTranslation ? (
                  <span className="button-spinner" aria-hidden="true" />
                ) : (
                  <span aria-hidden="true">🔊</span>
                )}
              </button>
            </div>
          ) : null}
        </div>

        <div className="swap-row">
          <button className="swap-button" type="button" onClick={onSwap} aria-label={t(uiLanguage, "swap")}>
            ↕
          </button>
        </div>

        <div className="translation-surface translation-output">
          <div className={isHebrewOutput ? "surface-header surface-header-rtl" : "surface-header"}>
            <div className="surface-language">{targetLanguage === "en" ? "English" : "עברית"}</div>
          </div>
          <textarea
            ref={outputRef}
            value={outputText}
            placeholder={isTranslating ? undefined : t(uiLanguage, "translationPlaceholder")}
            dir={isHebrewOutput ? "rtl" : "ltr"}
            rows={5}
            readOnly
          />
          {isTranslating ? (
            <div className="translation-output-loader" aria-live="polite" aria-label={t(uiLanguage, "translating")}>
              <span className="button-spinner" aria-hidden="true" />
            </div>
          ) : null}
          {canSpeakOutput ? (
            <div className="surface-action-row surface-action-row-output">
              <button
                className="icon-speak-button"
                type="button"
                aria-label={t(uiLanguage, "playAudio")}
                title={t(uiLanguage, "playAudio")}
                disabled={isSpeakingTranslation}
                onClick={onSpeakTranslation}
              >
                {isSpeakingTranslation ? (
                  <span className="button-spinner" aria-hidden="true" />
                ) : (
                  <span aria-hidden="true">🔊</span>
                )}
              </button>
            </div>
          ) : null}
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
