import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { StudyPanel } from "./components/StudyPanel";
import { TranslatorPanel } from "./components/TranslatorPanel";
import { api } from "./lib/api";
import { t } from "./lib/copy";
export default function App() {
    const uiLanguage = "en";
    const [currentUser, setCurrentUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [authMode, setAuthMode] = useState("login");
    const [authUsername, setAuthUsername] = useState("");
    const [authPassword, setAuthPassword] = useState("");
    const [isAuthBusy, setIsAuthBusy] = useState(false);
    const [issuedPassword, setIssuedPassword] = useState(null);
    const [sourceLanguage, setSourceLanguage] = useState("en");
    const [targetLanguage, setTargetLanguage] = useState("he");
    const [text, setText] = useState("");
    const [translationResult, setTranslationResult] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [suggestionsContextCount, setSuggestionsContextCount] = useState(0);
    const [currentCard, setCurrentCard] = useState(null);
    const [learnedWords, setLearnedWords] = useState(0);
    const [isTranslating, setIsTranslating] = useState(false);
    const [isSavingFlashcard, setIsSavingFlashcard] = useState(false);
    const [savingSuggestionId, setSavingSuggestionId] = useState(null);
    const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
    const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
    const [isReviewBusy, setIsReviewBusy] = useState(false);
    const [pendingReviewResult, setPendingReviewResult] = useState(null);
    const [isRemovingCard, setIsRemovingCard] = useState(false);
    const [isRevealed, setIsRevealed] = useState(false);
    const [toasts, setToasts] = useState([]);
    const [mobileTab, setMobileTab] = useState("translate");
    const appDirection = "ltr";
    const pushToast = useCallback((message, tone) => {
        const id = Date.now() + Math.random();
        setToasts((current) => [...current, { id, message, tone }]);
        window.setTimeout(() => {
            setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 3200);
    }, []);
    const clearSession = useCallback(() => {
        api.setSessionToken(null);
        setCurrentUser(null);
        setCurrentCard(null);
        setLearnedWords(0);
        setSuggestions([]);
        setSuggestionsContextCount(0);
        setTranslationResult(null);
        setText("");
        setIsSuggestionsOpen(false);
        setIsRevealed(false);
    }, []);
    const loadDeckData = useCallback(async () => {
        const [nextCard, stats] = await Promise.all([api.nextFlashcard(), api.stats()]);
        setCurrentCard(nextCard);
        setLearnedWords(stats.learnedWords);
    }, []);
    const loadSuggestions = useCallback(async () => {
        setIsSuggestionsLoading(true);
        setSuggestions([]);
        try {
            const response = await api.suggestions(sourceLanguage, targetLanguage, `${Date.now()}-${Math.random()}`);
            setSuggestions(response.suggestions);
            setSuggestionsContextCount(response.basedOnCount);
        }
        catch (requestError) {
            pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
        }
        finally {
            setIsSuggestionsLoading(false);
        }
    }, [pushToast, sourceLanguage, targetLanguage]);
    useEffect(() => {
        if (!api.getSessionToken()) {
            setIsAuthReady(true);
            return;
        }
        void Promise.all([api.me(), loadDeckData()])
            .then(([session]) => {
            setCurrentUser(session.user);
        })
            .catch((requestError) => {
            clearSession();
            pushToast(requestError.message || t(uiLanguage, "authSessionExpired"), "error");
        })
            .finally(() => {
            setIsAuthReady(true);
        });
    }, [clearSession, loadDeckData, pushToast, uiLanguage]);
    useEffect(() => {
        if (!isSuggestionsOpen) {
            return;
        }
        function handleKeyDown(event) {
            if (event.key === "Escape") {
                setIsSuggestionsOpen(false);
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isSuggestionsOpen]);
    async function handleTranslate() {
        try {
            setIsTranslating(true);
            const result = await api.translate({
                text,
                sourceLanguage,
                targetLanguage
            });
            setTranslationResult(result);
        }
        catch (requestError) {
            pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
        }
        finally {
            setIsTranslating(false);
        }
    }
    async function handleSaveFlashcard() {
        if (!translationResult) {
            return;
        }
        try {
            setIsSavingFlashcard(true);
            const response = await api.createFlashcard(translationResult);
            await loadDeckData();
            setLearnedWords(response.stats.learnedWords);
            setText("");
            setTranslationResult(null);
            setIsRevealed(false);
            setMobileTab("flashcards");
            pushToast(t(uiLanguage, "flashcardReady"), "success");
        }
        catch (requestError) {
            pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
        }
        finally {
            setIsSavingFlashcard(false);
        }
    }
    async function handleSaveSuggestedFlashcard(suggestion) {
        try {
            setSavingSuggestionId(suggestion.id);
            const response = await api.createFlashcard(suggestion);
            await loadDeckData();
            setLearnedWords(response.stats.learnedWords);
            setIsRevealed(false);
            setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
            pushToast(t(uiLanguage, "suggestionAdded"), "success");
        }
        catch (requestError) {
            pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
        }
        finally {
            setSavingSuggestionId(null);
        }
    }
    async function handleReview(result) {
        if (!currentCard) {
            return;
        }
        try {
            setIsReviewBusy(true);
            setPendingReviewResult(result);
            const response = await api.reviewFlashcard(currentCard.id, { result });
            setCurrentCard(response.nextCard);
            setLearnedWords(response.stats.learnedWords);
            setIsRevealed(false);
        }
        catch (requestError) {
            pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
        }
        finally {
            setIsReviewBusy(false);
            setPendingReviewResult(null);
        }
    }
    async function handleRemoveFlashcard() {
        if (!currentCard) {
            return;
        }
        try {
            setIsRemovingCard(true);
            const response = await api.deleteFlashcard(currentCard.id);
            setCurrentCard(response.nextCard);
            setLearnedWords(response.stats.learnedWords);
            setIsRevealed(false);
            pushToast(t(uiLanguage, "flashcardRemoved"), "success");
        }
        catch (requestError) {
            pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
        }
        finally {
            setIsRemovingCard(false);
        }
    }
    async function handleOpenSuggestions() {
        setIsSuggestionsOpen(true);
        await loadSuggestions();
    }
    async function handleSubmitAuth() {
        try {
            setIsAuthBusy(true);
            if (authMode === "register") {
                const response = await api.register({ username: authUsername });
                api.setSessionToken(response.sessionToken);
                setCurrentUser(response.user);
                setIssuedPassword(response.defaultPassword);
                setAuthPassword("");
            }
            else {
                const response = await api.login({ username: authUsername, password: authPassword });
                api.setSessionToken(response.sessionToken);
                setCurrentUser(response.user);
                setIssuedPassword(null);
                setAuthPassword("");
            }
            await loadDeckData();
            setIsAuthReady(true);
        }
        catch (requestError) {
            pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
        }
        finally {
            setIsAuthBusy(false);
        }
    }
    async function handleLogout() {
        try {
            await api.logout();
        }
        catch {
            // local reset still matters if the network request fails
        }
        finally {
            clearSession();
            setAuthPassword("");
            setIsAuthReady(true);
        }
    }
    function swapLanguages() {
        const nextSource = targetLanguage;
        const nextTarget = sourceLanguage;
        if (translationResult) {
            setText(translationResult.targetText);
            setTranslationResult({
                ...translationResult,
                sourceText: translationResult.targetText,
                sourceLanguage: nextSource,
                targetText: translationResult.sourceText,
                targetLanguage: nextTarget
            });
        }
        else {
            setTranslationResult(null);
        }
        setSourceLanguage(nextSource);
        setTargetLanguage(nextTarget);
    }
    function handleInputChange(value) {
        setText(value);
        if (translationResult) {
            setTranslationResult(null);
        }
    }
    if (!isAuthReady) {
        return (_jsxs("div", { className: "app-shell", dir: appDirection, children: [_jsx("div", { className: "background-glow glow-one" }), _jsx("div", { className: "background-glow glow-two" }), _jsx("div", { className: "background-glow glow-three" }), _jsx("div", { className: "background-glow glow-four" }), _jsx("div", { className: "background-glow glow-five" }), _jsx("div", { className: "background-glow glow-six" }), _jsx("main", { className: "auth-shell", children: _jsx("section", { className: "panel auth-panel auth-panel-loading", children: _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) }) })] }));
    }
    if (!currentUser) {
        return (_jsxs("div", { className: "app-shell", dir: appDirection, children: [_jsx("div", { className: "background-glow glow-one" }), _jsx("div", { className: "background-glow glow-two" }), _jsx("div", { className: "background-glow glow-three" }), _jsx("div", { className: "background-glow glow-four" }), _jsx("div", { className: "background-glow glow-five" }), _jsx("div", { className: "background-glow glow-six" }), _jsx("div", { className: "toast-stack", "aria-live": "polite", "aria-atomic": "true", children: toasts.map((toast) => (_jsx("div", { className: toast.tone === "error" ? "toast toast-error" : "toast toast-success", children: toast.message }, toast.id))) }), _jsx("main", { className: "auth-shell", children: _jsxs("section", { className: "panel auth-panel", children: [_jsx("img", { className: "brand-logo auth-logo", src: "/oolpan-logo.png", alt: "Oolpan" }), _jsx("h1", { children: t(uiLanguage, "authTitle") }), _jsxs("div", { className: "auth-tabs", role: "tablist", "aria-label": "Authentication", children: [_jsx("button", { type: "button", className: authMode === "login" ? "mobile-tab active" : "mobile-tab", onClick: () => setAuthMode("login"), children: t(uiLanguage, "authLoginTab") }), _jsx("button", { type: "button", className: authMode === "register" ? "mobile-tab active" : "mobile-tab", onClick: () => setAuthMode("register"), children: t(uiLanguage, "authRegisterTab") })] }), _jsxs("label", { className: "auth-field", children: [_jsx("span", { children: t(uiLanguage, "authUsernameLabel") }), _jsx("input", { value: authUsername, onChange: (event) => setAuthUsername(event.target.value), placeholder: t(uiLanguage, "authUsernamePlaceholder"), autoCapitalize: "none", autoCorrect: "off" })] }), authMode === "login" ? (_jsxs("label", { className: "auth-field", children: [_jsx("span", { children: t(uiLanguage, "authPasswordLabel") }), _jsx("input", { type: "password", value: authPassword, onChange: (event) => setAuthPassword(event.target.value), placeholder: t(uiLanguage, "authPasswordPlaceholder") })] })) : (_jsx("p", { className: "auth-hint", children: t(uiLanguage, "authRegisterHint") })), _jsx("button", { className: "primary-button auth-submit-button", type: "button", disabled: !authUsername.trim() || (authMode === "login" && !authPassword) || isAuthBusy, onClick: () => void handleSubmitAuth(), children: _jsxs("span", { className: "button-content", children: [isAuthBusy ? _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) : null, _jsx("span", { children: authMode === "register"
                                                ? isAuthBusy
                                                    ? t(uiLanguage, "authCreating")
                                                    : t(uiLanguage, "authCreateAction")
                                                : isAuthBusy
                                                    ? t(uiLanguage, "authLoggingIn")
                                                    : t(uiLanguage, "authLoginAction") })] }) })] }) })] }));
    }
    return (_jsxs("div", { className: "app-shell", dir: appDirection, children: [_jsx("div", { className: "background-glow glow-one" }), _jsx("div", { className: "background-glow glow-two" }), _jsx("div", { className: "background-glow glow-three" }), _jsx("div", { className: "background-glow glow-four" }), _jsx("div", { className: "background-glow glow-five" }), _jsx("div", { className: "background-glow glow-six" }), _jsx("header", { className: "app-header", children: _jsxs("div", { className: "brand-lockup", children: [_jsx("img", { className: "brand-logo", src: "/oolpan-logo.png", alt: "Oolpan" }), _jsx("h1", { className: "sr-only", children: t(uiLanguage, "appName") }), _jsxs("div", { className: "header-actions", children: [_jsx("button", { className: "secondary-button top-action-button", type: "button", disabled: isSuggestionsLoading, onClick: () => void handleOpenSuggestions(), children: _jsxs("span", { className: "button-content", children: [isSuggestionsLoading ? _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) : null, _jsx("span", { className: "button-emoji", "aria-hidden": "true", children: "\uD83D\uDCA1" }), _jsx("span", { children: t(uiLanguage, "getSuggestions") })] }) }), _jsxs("div", { className: "learned-counter", children: [_jsx("span", { className: "learned-counter-label", children: t(uiLanguage, "learnedWords") }), _jsx("strong", { children: learnedWords })] }), _jsxs("div", { className: "learned-counter", children: [_jsx("span", { className: "learned-counter-label", children: t(uiLanguage, "authSignedInAs") }), _jsx("strong", { children: currentUser.username })] }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => void handleLogout(), children: _jsx("span", { className: "button-content", children: _jsx("span", { children: t(uiLanguage, "authLogout") }) }) })] })] }) }), issuedPassword ? (_jsxs("div", { className: "password-banner", children: [_jsxs("div", { children: [_jsxs("strong", { children: [t(uiLanguage, "authPasswordNotice"), ":"] }), " ", _jsx("span", { children: issuedPassword })] }), _jsx("button", { className: "secondary-button password-banner-button", type: "button", onClick: () => setIssuedPassword(null), children: t(uiLanguage, "authPasswordDismiss") })] })) : null, _jsx("div", { className: "toast-stack", "aria-live": "polite", "aria-atomic": "true", children: toasts.map((toast) => (_jsx("div", { className: toast.tone === "error" ? "toast toast-error" : "toast toast-success", children: toast.message }, toast.id))) }), _jsxs("div", { className: "mobile-tabs", role: "tablist", "aria-label": "Sections", children: [_jsx("button", { type: "button", className: mobileTab === "translate" ? "mobile-tab active" : "mobile-tab", onClick: () => setMobileTab("translate"), children: t(uiLanguage, "translateTab") }), _jsx("button", { type: "button", className: mobileTab === "flashcards" ? "mobile-tab active" : "mobile-tab", onClick: () => setMobileTab("flashcards"), children: t(uiLanguage, "studyTab") })] }), _jsxs("main", { className: "main-grid", children: [_jsx("div", { className: mobileTab === "translate" ? "panel-wrap active-mobile" : "panel-wrap", children: _jsx(TranslatorPanel, { uiLanguage: uiLanguage, sourceLanguage: sourceLanguage, targetLanguage: targetLanguage, text: text, result: translationResult, isTranslating: isTranslating, isSaving: isSavingFlashcard, onTextChange: handleInputChange, onTranslate: handleTranslate, onSwap: swapLanguages, onSave: handleSaveFlashcard }) }), _jsx("div", { className: mobileTab === "flashcards" ? "panel-wrap active-mobile" : "panel-wrap", children: _jsx(StudyPanel, { uiLanguage: uiLanguage, card: currentCard, isRevealed: isRevealed, isBusy: isReviewBusy || isRemovingCard, pendingReviewResult: pendingReviewResult, isRemoving: isRemovingCard, onReveal: () => setIsRevealed(true), onReview: handleReview, onRemove: handleRemoveFlashcard }) })] }), isSuggestionsOpen ? (_jsx("div", { className: "modal-backdrop", role: "presentation", onClick: () => setIsSuggestionsOpen(false), children: _jsxs("section", { className: "modal-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "suggestions-title", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "section-row modal-header", children: [_jsxs("div", { children: [_jsx("h2", { id: "suggestions-title", children: t(uiLanguage, "suggestionsModalTitle") }), _jsx("p", { className: "modal-caption", children: suggestionsContextCount > 0
                                                ? `${t(uiLanguage, "suggestionsCaption")} (${suggestionsContextCount})`
                                                : t(uiLanguage, "suggestionsCaption") })] }), _jsx("button", { className: "secondary-button modal-close-button", type: "button", onClick: () => setIsSuggestionsOpen(false), children: t(uiLanguage, "close") })] }), isSuggestionsLoading ? (_jsxs("div", { className: "suggestions-empty suggestions-loading", children: [_jsx("span", { className: "button-spinner", "aria-hidden": "true" }), _jsx("span", { children: t(uiLanguage, "loadingSuggestions") })] })) : suggestions.length === 0 ? (_jsx("div", { className: "suggestions-empty", children: t(uiLanguage, "suggestionsEmpty") })) : (_jsx("div", { className: "suggestions-modal-grid", children: suggestions.map((suggestion) => (_jsxs("article", { className: "suggestion-card", children: [_jsxs("div", { className: "suggestion-copy", children: [_jsx("p", { dir: suggestion.sourceLanguage === "he" ? "rtl" : "ltr", children: suggestion.sourceText }), _jsx("p", { className: "suggestion-translation", dir: suggestion.targetLanguage === "he" ? "rtl" : "ltr", children: suggestion.targetText })] }), _jsx("button", { className: "suggestion-add-button", type: "button", disabled: savingSuggestionId !== null, onClick: () => void handleSaveSuggestedFlashcard(suggestion), children: _jsxs("span", { className: "button-content", children: [savingSuggestionId === suggestion.id ? _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) : null, _jsx("span", { children: t(uiLanguage, "addSuggestion") })] }) })] }, suggestion.id))) }))] }) })) : null] }));
}
