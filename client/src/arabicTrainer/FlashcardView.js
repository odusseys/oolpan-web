import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ARABIC_FORM_IDS, ARABIC_FORM_LABELS } from "./deck";
export function FlashcardView({ card, stat, isLoaded, isRevealed, onReveal, onReview }) {
    if (!isLoaded || !card || !stat) {
        return (_jsx("section", { className: "flashcard-panel", "aria-busy": "true", children: _jsx("div", { className: "flashcard-surface loading-surface", children: "Loading deck..." }) }));
    }
    return (_jsxs("section", { className: "flashcard-panel", "aria-label": "Arabic vocalization flashcard", children: [_jsxs("div", { className: "card-meta", children: [_jsx("span", { children: card.direction === "arabic_to_english" ? "Arabic to English" : "English to Arabic" }), _jsxs("span", { children: [card.arabicForm ? `${ARABIC_FORM_LABELS[card.arabicForm]} / ` : "", card.pair.vocalization.name] })] }), _jsxs("div", { className: "flashcard-surface", children: [_jsx("div", { className: card.promptLanguage === "arabic" ? "prompt arabic-prompt" : "prompt english-prompt", dir: card.promptLanguage === "arabic" ? "rtl" : "ltr", children: card.promptText }), isRevealed ? (_jsxs("div", { className: "answer-block", children: [_jsx("span", { className: "answer-label", children: "Answer" }), _jsx(Answer, { card: card })] })) : null] }), _jsxs("div", { className: "review-strip", children: [_jsxs("div", { children: [_jsx("span", { className: "metric-label", children: "Score" }), _jsxs("strong", { children: [Math.round(stat.score * 100), "%"] })] }), _jsxs("div", { children: [_jsx("span", { className: "metric-label", children: "Reviews" }), _jsx("strong", { children: stat.reviewCount })] }), _jsxs("div", { children: [_jsx("span", { className: "metric-label", children: "Mistakes" }), _jsx("strong", { children: stat.mistakeCount })] })] }), !isRevealed ? (_jsx("button", { className: "primary-action", type: "button", onClick: onReveal, children: "Guess" })) : (_jsxs("div", { className: "review-actions", "aria-label": "Review result", children: [_jsx("button", { className: "oops-action", type: "button", onClick: () => onReview("oops"), children: "Oops" }), _jsx("button", { className: "got-action", type: "button", onClick: () => onReview("got_it"), children: "Got it" })] }))] }));
}
function Answer({ card }) {
    if (card.promptLanguage === "arabic") {
        return (_jsx("div", { className: "answer english-answer", dir: "ltr", children: card.answerText }));
    }
    return (_jsx("div", { className: "form-answer-grid", dir: "rtl", children: ARABIC_FORM_IDS.map((form) => (_jsxs("div", { className: "form-answer-card", children: [_jsx("strong", { children: ARABIC_FORM_LABELS[form] }), _jsx("span", { className: "arabic-answer", children: card.pair.arabicForms[form] })] }, form))) }));
}
