import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { FlashcardView } from "./FlashcardView";
import { LetterChartModal } from "./LetterChartModal";
import { ProgressPanel } from "./ProgressPanel";
import { useArabicTrainer } from "./useArabicTrainer";
export default function ArabicLetterTrainer() {
    const [isChartOpen, setIsChartOpen] = useState(false);
    const { currentCard, currentStat, isLoaded, isRevealed, storageError, summary, reveal, review } = useArabicTrainer();
    return (_jsxs("main", { className: "arabic-trainer-root", children: [_jsx("header", { className: "app-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Arabic vocalization trainer" }), _jsx("h1", { children: "Letter flashcards" })] }) }), _jsxs("div", { className: "trainer-layout", children: [_jsx(FlashcardView, { card: currentCard, stat: currentStat, isLoaded: isLoaded, isRevealed: isRevealed, onReveal: reveal, onReview: review }), _jsx(ProgressPanel, { summary: summary, storageError: storageError, onOpenChart: () => setIsChartOpen(true) })] }), _jsx(LetterChartModal, { isOpen: isChartOpen, onClose: () => setIsChartOpen(false) })] }));
}
