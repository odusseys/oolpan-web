import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef } from "react";
import { t } from "../lib/copy";
const TRANSLATION_TEXTAREA_MIN_HEIGHT = 120;
function resizeTranslationTextarea(textarea) {
    if (!textarea) {
        return;
    }
    textarea.style.height = `${TRANSLATION_TEXTAREA_MIN_HEIGHT}px`;
    textarea.style.height = `${Math.max(TRANSLATION_TEXTAREA_MIN_HEIGHT, textarea.scrollHeight)}px`;
}
export function TranslatorPanel({ uiLanguage, sourceLanguage, targetLanguage, text, result, isTranslating, isSaving, isSpeakingTranslation, onTextChange, onSwap, onSave, onSpeakTranslation }) {
    const inputRef = useRef(null);
    const outputRef = useRef(null);
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
    return (_jsxs("section", { className: "panel translator-panel", children: [_jsx("h2", { children: t(uiLanguage, "translateTab") }), _jsxs("div", { className: "translate-stack", children: [_jsxs("div", { className: "translation-surface translation-input-surface", children: [_jsx("div", { className: isHebrewInput ? "surface-header surface-header-rtl" : "surface-header", children: _jsx("div", { className: "surface-language", children: sourceLanguage === "en" ? "English" : "עברית" }) }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "sr-only", children: t(uiLanguage, "phraseLabel") }), _jsx("textarea", { ref: inputRef, value: text, onChange: (event) => onTextChange(event.target.value), placeholder: t(uiLanguage, isHebrewInput ? "phrasePlaceholderHe" : "phrasePlaceholderEn"), dir: isHebrewInput ? "rtl" : "ltr", rows: 5, maxLength: 1000 })] }), canSpeakInput ? (_jsx("div", { className: "surface-action-row", children: _jsx("button", { className: "icon-speak-button", type: "button", "aria-label": t(uiLanguage, "playAudio"), title: t(uiLanguage, "playAudio"), disabled: isSpeakingTranslation, onClick: onSpeakTranslation, children: isSpeakingTranslation ? (_jsx("span", { className: "button-spinner", "aria-hidden": "true" })) : (_jsx("span", { "aria-hidden": "true", children: "\uD83D\uDD0A" })) }) })) : null] }), _jsx("div", { className: "swap-row", children: _jsx("button", { className: "swap-button", type: "button", onClick: onSwap, "aria-label": t(uiLanguage, "swap"), children: "\u2195" }) }), _jsxs("div", { className: "translation-surface translation-output", children: [_jsx("div", { className: isHebrewOutput ? "surface-header surface-header-rtl" : "surface-header", children: _jsx("div", { className: "surface-language", children: targetLanguage === "en" ? "English" : "עברית" }) }), _jsx("textarea", { ref: outputRef, value: outputText, placeholder: isTranslating ? undefined : t(uiLanguage, "translationPlaceholder"), dir: isHebrewOutput ? "rtl" : "ltr", rows: 5, readOnly: true }), isTranslating ? (_jsx("div", { className: "translation-output-loader", "aria-live": "polite", "aria-label": t(uiLanguage, "translating"), children: _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) })) : null, canSpeakOutput ? (_jsx("div", { className: "surface-action-row surface-action-row-output", children: _jsx("button", { className: "icon-speak-button", type: "button", "aria-label": t(uiLanguage, "playAudio"), title: t(uiLanguage, "playAudio"), disabled: isSpeakingTranslation, onClick: onSpeakTranslation, children: isSpeakingTranslation ? (_jsx("span", { className: "button-spinner", "aria-hidden": "true" })) : (_jsx("span", { "aria-hidden": "true", children: "\uD83D\uDD0A" })) }) })) : null] })] }), _jsx("div", { className: "translate-actions translate-actions-single", children: _jsx("button", { className: "secondary-button", type: "button", onClick: onSave, disabled: !result || isSaving, children: _jsxs("span", { className: "button-content", children: [isSaving ? _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) : null, _jsx("span", { children: isSaving ? t(uiLanguage, "addingFlashcard") : t(uiLanguage, "addFlashcard") })] }) }) })] }));
}
