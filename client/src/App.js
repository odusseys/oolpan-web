import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { StudyPanel } from "./components/StudyPanel";
import { TranslatorPanel } from "./components/TranslatorPanel";
import { api } from "./lib/api";
import { t } from "./lib/copy";
const AUTO_SPEAK_HEBREW_STORAGE_KEY = "oolpan_auto_speak_hebrew_flashcards";
const AUTO_SPEAK_DELAY_MS = 500;
const IMAGE_CACHE_STORAGE_PREFIX = "oolpan_image_cache";
const AUDIO_CACHE_STORAGE_PREFIX = "oolpan_audio_cache";
export default function App() {
    const uiLanguage = "en";
    const [currentUser, setCurrentUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [authMode, setAuthMode] = useState("login");
    const [authUsername, setAuthUsername] = useState("");
    const [authPassword, setAuthPassword] = useState("");
    const [isAuthBusy, setIsAuthBusy] = useState(false);
    const [googleClientId, setGoogleClientId] = useState(null);
    const [isGoogleConfigLoading, setIsGoogleConfigLoading] = useState(true);
    const [isGoogleScriptReady, setIsGoogleScriptReady] = useState(false);
    const [isGoogleAuthBusy, setIsGoogleAuthBusy] = useState(false);
    const [issuedPassword, setIssuedPassword] = useState(null);
    const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
    const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
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
    const [loadingAudioKey, setLoadingAudioKey] = useState(null);
    const [toasts, setToasts] = useState([]);
    const [mobileTab, setMobileTab] = useState("translate");
    const [autoSpeakHebrewFlashcards, setAutoSpeakHebrewFlashcards] = useState(() => {
        if (typeof window === "undefined") {
            return false;
        }
        return window.localStorage.getItem(AUTO_SPEAK_HEBREW_STORAGE_KEY) === "true";
    });
    const audioUrlCacheRef = useRef(new Map());
    const currentAudioRef = useRef(null);
    const googleButtonRef = useRef(null);
    const googleInitializedRef = useRef(false);
    const headerMenuRef = useRef(null);
    const lastAutoSpokenOccurrenceRef = useRef(null);
    const autoSpeakTimeoutRef = useRef(null);
    const translatorSpeechText = sourceLanguage === "he"
        ? text.trim()
        : translationResult?.targetLanguage === "he"
            ? translationResult.targetText
            : "";
    const translatorSpeechLanguage = sourceLanguage === "he" ? sourceLanguage : (translationResult?.targetLanguage ?? targetLanguage);
    const translationAudioKey = `translator:${translatorSpeechLanguage}:${translatorSpeechText}`;
    const appDirection = "ltr";
    const pushToast = useCallback((message, tone) => {
        const id = Date.now() + Math.random();
        setToasts((current) => [...current, { id, message, tone }]);
        window.setTimeout(() => {
            setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 3200);
    }, []);
    const hydrateStudyCardImage = useCallback((card) => {
        if (!card || typeof window === "undefined") {
            return card;
        }
        const storageKey = `${IMAGE_CACHE_STORAGE_PREFIX}:${card.id}:${card.updatedAt}`;
        if (card.imageUrl?.startsWith("data:")) {
            window.localStorage.setItem(storageKey, card.imageUrl);
            return card;
        }
        const cachedImageUrl = window.localStorage.getItem(storageKey);
        if (!cachedImageUrl) {
            return card;
        }
        return {
            ...card,
            imageUrl: cachedImageUrl
        };
    }, []);
    const clearSession = useCallback(() => {
        currentAudioRef.current?.pause();
        currentAudioRef.current = null;
        audioUrlCacheRef.current.clear();
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
        setLoadingAudioKey(null);
    }, []);
    useEffect(() => {
        let isCancelled = false;
        void api
            .googleAuthConfig()
            .then((config) => {
            if (isCancelled) {
                return;
            }
            setGoogleClientId(config.enabled ? config.clientId : null);
        })
            .catch(() => {
            if (!isCancelled) {
                setGoogleClientId(null);
            }
        })
            .finally(() => {
            if (!isCancelled) {
                setIsGoogleConfigLoading(false);
            }
        });
        return () => {
            isCancelled = true;
        };
    }, []);
    useEffect(() => {
        if (!googleClientId) {
            setIsGoogleScriptReady(false);
            return;
        }
        const googleWindow = window;
        if (googleWindow.google?.accounts?.id) {
            setIsGoogleScriptReady(true);
            return;
        }
        const existingScript = document.getElementById("google-identity-services");
        if (existingScript) {
            const handleLoad = () => setIsGoogleScriptReady(true);
            existingScript.addEventListener("load", handleLoad);
            return () => existingScript.removeEventListener("load", handleLoad);
        }
        const script = document.createElement("script");
        script.id = "google-identity-services";
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = () => setIsGoogleScriptReady(true);
        document.head.appendChild(script);
        return () => {
            script.onload = null;
        };
    }, [googleClientId]);
    const loadDeckData = useCallback(async () => {
        const [nextCard, stats] = await Promise.all([api.nextFlashcard(), api.stats()]);
        setCurrentCard(hydrateStudyCardImage(nextCard));
        setLearnedWords(stats.learnedWords);
    }, [hydrateStudyCardImage]);
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
    useEffect(() => {
        if (!isAppMenuOpen && !isLogoutConfirmOpen && !isHelpOpen) {
            return;
        }
        function handleKeyDown(event) {
            if (event.key === "Escape") {
                setIsAppMenuOpen(false);
                setIsLogoutConfirmOpen(false);
                setIsHelpOpen(false);
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isAppMenuOpen, isHelpOpen, isLogoutConfirmOpen]);
    useEffect(() => {
        window.localStorage.setItem(AUTO_SPEAK_HEBREW_STORAGE_KEY, String(autoSpeakHebrewFlashcards));
    }, [autoSpeakHebrewFlashcards]);
    useEffect(() => {
        if (!isAppMenuOpen) {
            return;
        }
        function handlePointerDown(event) {
            if (!headerMenuRef.current?.contains(event.target)) {
                setIsAppMenuOpen(false);
            }
        }
        window.addEventListener("pointerdown", handlePointerDown);
        return () => window.removeEventListener("pointerdown", handlePointerDown);
    }, [isAppMenuOpen]);
    useEffect(() => {
        return () => {
            if (autoSpeakTimeoutRef.current !== null) {
                window.clearTimeout(autoSpeakTimeoutRef.current);
            }
            currentAudioRef.current?.pause();
            currentAudioRef.current = null;
        };
    }, []);
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
            setCurrentCard(hydrateStudyCardImage(response.nextCard));
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
            setCurrentCard(hydrateStudyCardImage(response.nextCard));
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
    const handleSpeak = useCallback(async (key, speechText, language, options) => {
        const trimmedText = speechText.trim();
        if (!trimmedText || loadingAudioKey !== null) {
            return;
        }
        try {
            let audioUrl = audioUrlCacheRef.current.get(key);
            if (!audioUrl && typeof window !== "undefined") {
                const cachedAudioUrl = window.localStorage.getItem(`${AUDIO_CACHE_STORAGE_PREFIX}:${key}`);
                if (cachedAudioUrl) {
                    audioUrlCacheRef.current.set(key, cachedAudioUrl);
                    audioUrl = cachedAudioUrl;
                }
            }
            if (!audioUrl) {
                setLoadingAudioKey(key);
                const response = await api.speak({ text: trimmedText, language });
                audioUrl = response.audioUrl;
                audioUrlCacheRef.current.set(key, audioUrl);
                if (typeof window !== "undefined") {
                    window.localStorage.setItem(`${AUDIO_CACHE_STORAGE_PREFIX}:${key}`, audioUrl);
                }
            }
            if (!audioUrl) {
                throw new Error("Audio URL was missing from the speech response");
            }
            currentAudioRef.current?.pause();
            currentAudioRef.current = null;
            const audio = new Audio(audioUrl);
            currentAudioRef.current = audio;
            await audio.play();
        }
        catch (requestError) {
            const message = requestError instanceof Error ? requestError.message : "Unknown error";
            const isExpectedAutoplayBlock = options?.suppressAutoplayError &&
                typeof message === "string" &&
                (message.includes("user didn't interact with the document first") ||
                    message.includes("play() failed because the user didn't interact"));
            if (!isExpectedAutoplayBlock) {
                pushToast(message, "error");
            }
        }
        finally {
            setLoadingAudioKey((current) => (current === key ? null : current));
        }
    }, [loadingAudioKey, pushToast]);
    useEffect(() => {
        if (autoSpeakTimeoutRef.current !== null) {
            window.clearTimeout(autoSpeakTimeoutRef.current);
            autoSpeakTimeoutRef.current = null;
        }
        if (!currentCard) {
            lastAutoSpokenOccurrenceRef.current = null;
            return;
        }
        let nextAutoSpeakKey = null;
        let nextOccurrenceKey = null;
        let nextText = "";
        let nextLanguage = null;
        if (!isRevealed && currentCard.promptLanguage === "he") {
            nextAutoSpeakKey = `flashcard:${currentCard.id}:prompt:${currentCard.promptLanguage}:${currentCard.promptText}`;
            nextOccurrenceKey = `${currentCard.id}:${currentCard.updatedAt}:prompt:${currentCard.promptLanguage}:${currentCard.promptText}`;
            nextText = currentCard.promptText;
            nextLanguage = currentCard.promptLanguage;
        }
        else if (isRevealed && currentCard.answerLanguage === "he") {
            nextAutoSpeakKey = `flashcard:${currentCard.id}:answer:${currentCard.answerLanguage}:${currentCard.answerText}`;
            nextOccurrenceKey = `${currentCard.id}:${currentCard.updatedAt}:answer:${currentCard.answerLanguage}:${currentCard.answerText}`;
            nextText = currentCard.answerText;
            nextLanguage = currentCard.answerLanguage;
        }
        if (!autoSpeakHebrewFlashcards || !nextAutoSpeakKey || !nextOccurrenceKey || !nextLanguage || loadingAudioKey !== null) {
            return;
        }
        if (lastAutoSpokenOccurrenceRef.current === nextOccurrenceKey) {
            return;
        }
        lastAutoSpokenOccurrenceRef.current = nextOccurrenceKey;
        autoSpeakTimeoutRef.current = window.setTimeout(() => {
            autoSpeakTimeoutRef.current = null;
            void handleSpeak(nextAutoSpeakKey, nextText, nextLanguage, { suppressAutoplayError: true });
        }, AUTO_SPEAK_DELAY_MS);
        return () => {
            if (autoSpeakTimeoutRef.current !== null) {
                window.clearTimeout(autoSpeakTimeoutRef.current);
                autoSpeakTimeoutRef.current = null;
            }
        };
    }, [autoSpeakHebrewFlashcards, currentCard, handleSpeak, isRevealed, loadingAudioKey]);
    const handleGoogleCredential = useCallback(async (credential) => {
        if (!credential) {
            pushToast("Google sign-in did not return a credential", "error");
            return;
        }
        try {
            setIsGoogleAuthBusy(true);
            const response = await api.loginWithGoogle({ credential });
            api.setSessionToken(response.sessionToken);
            setCurrentUser(response.user);
            setIssuedPassword(null);
            setAuthUsername("");
            setAuthPassword("");
            await loadDeckData();
            setIsAuthReady(true);
        }
        catch (requestError) {
            pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
        }
        finally {
            setIsGoogleAuthBusy(false);
        }
    }, [loadDeckData, pushToast]);
    useEffect(() => {
        if (currentUser || !googleClientId || !isGoogleScriptReady || !googleButtonRef.current) {
            return;
        }
        const googleWindow = window;
        const googleIdentity = googleWindow.google?.accounts?.id;
        if (!googleIdentity) {
            return;
        }
        if (!googleInitializedRef.current) {
            googleIdentity.initialize({
                client_id: googleClientId,
                callback: (response) => {
                    if (response.credential) {
                        void handleGoogleCredential(response.credential);
                    }
                    else {
                        pushToast("Google sign-in did not return a credential", "error");
                    }
                }
            });
            googleInitializedRef.current = true;
        }
        googleButtonRef.current.innerHTML = "";
        googleIdentity.renderButton(googleButtonRef.current, {
            theme: "outline",
            size: "large",
            text: authMode === "register" ? "signup_with" : "signin_with",
            shape: "pill",
            width: 360
        });
    }, [authMode, currentUser, googleClientId, handleGoogleCredential, isGoogleScriptReady, pushToast]);
    async function handleSubmitAuth() {
        try {
            setIsAuthBusy(true);
            if (authMode === "register") {
                const response = await api.register({ username: authUsername });
                api.setSessionToken(response.sessionToken);
                setCurrentUser(response.user);
                setIssuedPassword(response.defaultPassword);
                setAuthUsername("");
                setAuthPassword("");
            }
            else {
                const response = await api.login({ username: authUsername, password: authPassword });
                api.setSessionToken(response.sessionToken);
                setCurrentUser(response.user);
                setIssuedPassword(null);
                setAuthUsername("");
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
    async function handleCopyIssuedPassword() {
        if (!issuedPassword) {
            return;
        }
        try {
            await navigator.clipboard.writeText(issuedPassword);
            pushToast(t(uiLanguage, "authPasswordCopied"), "success");
        }
        catch (requestError) {
            pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
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
            setIsAppMenuOpen(false);
            setIsLogoutConfirmOpen(false);
            clearSession();
            setIssuedPassword(null);
            setAuthUsername("");
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
        return (_jsxs("div", { className: "app-shell", dir: appDirection, children: [_jsx("div", { className: "background-glow glow-one" }), _jsx("div", { className: "background-glow glow-two" }), _jsx("div", { className: "background-glow glow-three" }), _jsx("div", { className: "background-glow glow-four" }), _jsx("div", { className: "background-glow glow-five" }), _jsx("div", { className: "background-glow glow-six" }), _jsx("div", { className: "toast-stack", "aria-live": "polite", "aria-atomic": "true", children: toasts.map((toast) => (_jsx("div", { className: toast.tone === "error" ? "toast toast-error" : "toast toast-success", children: toast.message }, toast.id))) }), _jsx("main", { className: "auth-shell", children: _jsxs("section", { className: "panel auth-panel", children: [_jsx("img", { className: "brand-logo auth-logo", src: "/oolpan-logo.png", alt: "Oolpan" }), _jsx("h1", { children: t(uiLanguage, "authTitle") }), _jsxs("div", { className: "auth-tabs", role: "tablist", "aria-label": "Authentication", children: [_jsx("button", { type: "button", className: authMode === "login" ? "mobile-tab active" : "mobile-tab", onClick: () => setAuthMode("login"), children: t(uiLanguage, "authLoginTab") }), _jsx("button", { type: "button", className: authMode === "register" ? "mobile-tab active" : "mobile-tab", onClick: () => setAuthMode("register"), children: t(uiLanguage, "authRegisterTab") })] }), _jsxs("label", { className: "auth-field", children: [_jsx("span", { children: t(uiLanguage, "authUsernameLabel") }), _jsx("input", { value: authUsername, onChange: (event) => setAuthUsername(event.target.value), placeholder: t(uiLanguage, "authUsernamePlaceholder"), autoCapitalize: "none", autoCorrect: "off" })] }), authMode === "login" ? (_jsxs("label", { className: "auth-field", children: [_jsx("span", { children: t(uiLanguage, "authPasswordLabel") }), _jsx("input", { type: "password", value: authPassword, onChange: (event) => setAuthPassword(event.target.value), placeholder: t(uiLanguage, "authPasswordPlaceholder") })] })) : (_jsx("p", { className: "auth-hint", children: t(uiLanguage, "authRegisterHint") })), _jsx("button", { className: "primary-button auth-submit-button", type: "button", disabled: !authUsername.trim() || (authMode === "login" && !authPassword) || isAuthBusy || isGoogleAuthBusy, onClick: () => void handleSubmitAuth(), children: _jsxs("span", { className: "button-content", children: [isAuthBusy ? _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) : null, _jsx("span", { children: authMode === "register"
                                                ? isAuthBusy
                                                    ? t(uiLanguage, "authCreating")
                                                    : t(uiLanguage, "authCreateAction")
                                                : isAuthBusy
                                                    ? t(uiLanguage, "authLoggingIn")
                                                    : t(uiLanguage, "authLoginAction") })] }) }), isGoogleConfigLoading || googleClientId ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "auth-divider", "aria-hidden": "true", children: _jsx("span", { children: t(uiLanguage, "authDivider") }) }), _jsx("div", { className: "google-auth-block", children: isGoogleAuthBusy ? (_jsx("button", { className: "secondary-button google-auth-fallback-button", type: "button", disabled: true, children: _jsxs("span", { className: "button-content", children: [_jsx("span", { className: "button-spinner", "aria-hidden": "true" }), _jsx("span", { children: t(uiLanguage, "authGoogleWorking") })] }) })) : isGoogleConfigLoading ? (_jsxs("div", { className: "google-auth-loading", "aria-live": "polite", children: [_jsx("span", { className: "button-spinner", "aria-hidden": "true" }), _jsx("span", { children: t(uiLanguage, "authGoogleLoading") })] })) : (_jsx("div", { ref: googleButtonRef, className: "google-signin-button", "aria-label": t(uiLanguage, "authGoogleAction") })) })] })) : null] }) })] }));
    }
    if (currentUser && issuedPassword) {
        return (_jsxs("div", { className: "app-shell", dir: appDirection, children: [_jsx("div", { className: "background-glow glow-one" }), _jsx("div", { className: "background-glow glow-two" }), _jsx("div", { className: "background-glow glow-three" }), _jsx("div", { className: "background-glow glow-four" }), _jsx("div", { className: "background-glow glow-five" }), _jsx("div", { className: "background-glow glow-six" }), _jsx("div", { className: "toast-stack", "aria-live": "polite", "aria-atomic": "true", children: toasts.map((toast) => (_jsx("div", { className: toast.tone === "error" ? "toast toast-error" : "toast toast-success", children: toast.message }, toast.id))) }), _jsx("main", { className: "auth-shell", children: _jsxs("section", { className: "panel auth-panel", children: [_jsx("img", { className: "brand-logo auth-logo", src: "/oolpan-logo.png", alt: "Oolpan" }), _jsx("h1", { children: t(uiLanguage, "authPasswordScreenTitle") }), _jsx("p", { className: "auth-password-warning", children: t(uiLanguage, "authPasswordScreenBody") }), _jsxs("div", { className: "password-card", children: [_jsx("span", { className: "password-card-label", children: t(uiLanguage, "authPasswordNotice") }), _jsx("strong", { children: issuedPassword }), _jsx("button", { className: "secondary-button password-card-copy-button", type: "button", onClick: () => void handleCopyIssuedPassword(), children: _jsx("span", { className: "button-content", children: _jsx("span", { children: t(uiLanguage, "authCopyPassword") }) }) })] }), _jsx("div", { className: "auth-actions", children: _jsx("button", { className: "primary-button auth-inline-button", type: "button", onClick: () => {
                                        setIssuedPassword(null);
                                        setIsHelpOpen(true);
                                    }, children: _jsx("span", { className: "button-content", children: _jsx("span", { children: t(uiLanguage, "authContinueToApp") }) }) }) })] }) })] }));
    }
    return (_jsxs("div", { className: "app-shell", dir: appDirection, children: [_jsx("div", { className: "background-glow glow-one" }), _jsx("div", { className: "background-glow glow-two" }), _jsx("div", { className: "background-glow glow-three" }), _jsx("div", { className: "background-glow glow-four" }), _jsx("div", { className: "background-glow glow-five" }), _jsx("div", { className: "background-glow glow-six" }), _jsxs("header", { className: "app-header", children: [_jsxs("div", { className: "brand-lockup", children: [_jsx("img", { className: "brand-logo", src: "/oolpan-logo.png", alt: "Oolpan" }), _jsx("h1", { className: "sr-only", children: t(uiLanguage, "appName") }), _jsxs("div", { className: "header-actions", children: [_jsx("button", { className: "secondary-button top-action-button", type: "button", disabled: isSuggestionsLoading, onClick: () => void handleOpenSuggestions(), children: _jsxs("span", { className: "button-content", children: [isSuggestionsLoading ? _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) : null, _jsx("span", { className: "button-emoji", "aria-hidden": "true", children: "\uD83D\uDCA1" }), _jsx("span", { children: t(uiLanguage, "getSuggestions") })] }) }), _jsxs("div", { className: "learned-counter", children: [_jsx("span", { className: "learned-counter-label", children: t(uiLanguage, "learnedWords") }), _jsx("strong", { children: learnedWords }), _jsx("div", { className: "help-shell", children: _jsx("button", { className: "help-trigger", type: "button", "aria-label": t(uiLanguage, "helpLabel"), "aria-expanded": isHelpOpen, onClick: () => setIsHelpOpen((current) => !current), children: "?" }) })] })] })] }), _jsxs("div", { className: "header-menu-shell", ref: headerMenuRef, children: [_jsx("button", { className: "menu-trigger header-menu-trigger", type: "button", "aria-haspopup": "menu", "aria-expanded": isAppMenuOpen, "aria-label": t(uiLanguage, "authMenuLabel"), onClick: () => setIsAppMenuOpen((current) => !current), children: "\u22EF" }), isAppMenuOpen ? (_jsx("div", { className: "menu-popover header-menu-popover", role: "menu", children: _jsx("button", { className: "menu-action header-menu-action", type: "button", onClick: () => {
                                        setIsAppMenuOpen(false);
                                        setIsLogoutConfirmOpen(true);
                                    }, children: t(uiLanguage, "authLogout") }) })) : null] })] }), issuedPassword ? (_jsxs("div", { className: "password-banner", children: [_jsxs("div", { children: [_jsxs("strong", { children: [t(uiLanguage, "authPasswordNotice"), ":"] }), " ", _jsx("span", { children: issuedPassword })] }), _jsx("button", { className: "secondary-button password-banner-button", type: "button", onClick: () => setIssuedPassword(null), children: t(uiLanguage, "authPasswordDismiss") })] })) : null, isLogoutConfirmOpen ? (_jsx("div", { className: "modal-backdrop", role: "presentation", onClick: () => setIsLogoutConfirmOpen(false), children: _jsxs("section", { className: "modal-panel confirm-panel", role: "dialog", "aria-modal": "true", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "confirm-copy", children: [_jsx("h2", { children: t(uiLanguage, "authLogoutConfirmTitle") }), _jsx("p", { className: "modal-caption confirm-body", children: t(uiLanguage, "authLogoutConfirmBody") })] }), _jsxs("div", { className: "confirm-actions", children: [_jsx("button", { className: "secondary-button", type: "button", onClick: () => setIsLogoutConfirmOpen(false), children: _jsx("span", { className: "button-content", children: _jsx("span", { children: t(uiLanguage, "authCancel") }) }) }), _jsx("button", { className: "danger-button", type: "button", onClick: () => void handleLogout(), children: _jsx("span", { className: "button-content", children: _jsx("span", { children: t(uiLanguage, "authConfirmLogout") }) }) })] })] }) })) : null, isHelpOpen ? (_jsx("div", { className: "modal-backdrop", role: "presentation", onClick: () => setIsHelpOpen(false), children: _jsxs("section", { className: "modal-panel help-modal", role: "dialog", "aria-modal": "true", onClick: (event) => event.stopPropagation(), children: [_jsx("div", { className: "confirm-copy", children: _jsx("h2", { children: t(uiLanguage, "helpLabel") }) }), _jsxs("ol", { className: "help-modal-copy", children: [_jsx("li", { children: t(uiLanguage, "helpTranslate") }), _jsx("li", { children: t(uiLanguage, "helpGuess") }), _jsx("li", { children: t(uiLanguage, "helpReview") }), _jsx("li", { children: t(uiLanguage, "helpAdaptive") })] }), _jsx("div", { className: "confirm-actions", children: _jsx("button", { className: "secondary-button", type: "button", onClick: () => setIsHelpOpen(false), children: _jsx("span", { className: "button-content", children: _jsx("span", { children: t(uiLanguage, "close") }) }) }) })] }) })) : null, _jsx("div", { className: "toast-stack", "aria-live": "polite", "aria-atomic": "true", children: toasts.map((toast) => (_jsx("div", { className: toast.tone === "error" ? "toast toast-error" : "toast toast-success", children: toast.message }, toast.id))) }), _jsxs("div", { className: "mobile-tabs", role: "tablist", "aria-label": "Sections", children: [_jsx("button", { type: "button", className: mobileTab === "translate" ? "mobile-tab active" : "mobile-tab", onClick: () => setMobileTab("translate"), children: t(uiLanguage, "translateTab") }), _jsx("button", { type: "button", className: mobileTab === "flashcards" ? "mobile-tab active" : "mobile-tab", onClick: () => setMobileTab("flashcards"), children: t(uiLanguage, "studyTab") })] }), _jsxs("main", { className: "main-grid", children: [_jsx("div", { className: mobileTab === "translate" ? "panel-wrap active-mobile" : "panel-wrap", children: _jsx(TranslatorPanel, { uiLanguage: uiLanguage, sourceLanguage: sourceLanguage, targetLanguage: targetLanguage, text: text, result: translationResult, isTranslating: isTranslating, isSaving: isSavingFlashcard, isSpeakingTranslation: loadingAudioKey === translationAudioKey, onTextChange: handleInputChange, onTranslate: handleTranslate, onSwap: swapLanguages, onSave: handleSaveFlashcard, onSpeakTranslation: () => void handleSpeak(translationAudioKey, translatorSpeechText, translatorSpeechLanguage) }) }), _jsx("div", { className: mobileTab === "flashcards" ? "panel-wrap active-mobile" : "panel-wrap", children: _jsx(StudyPanel, { uiLanguage: uiLanguage, card: currentCard, isRevealed: isRevealed, isBusy: isReviewBusy || isRemovingCard, pendingReviewResult: pendingReviewResult, isRemoving: isRemovingCard, loadingAudioKey: loadingAudioKey, autoSpeakHebrew: autoSpeakHebrewFlashcards, onReveal: () => setIsRevealed(true), onReview: handleReview, onRemove: handleRemoveFlashcard, onToggleAutoSpeakHebrew: () => setAutoSpeakHebrewFlashcards((current) => !current), onSpeak: (key, speechText, language) => void handleSpeak(key, speechText, language) }) })] }), isSuggestionsOpen ? (_jsx("div", { className: "modal-backdrop", role: "presentation", onClick: () => setIsSuggestionsOpen(false), children: _jsxs("section", { className: "modal-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "suggestions-title", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "section-row modal-header", children: [_jsxs("div", { children: [_jsx("h2", { id: "suggestions-title", children: t(uiLanguage, "suggestionsModalTitle") }), _jsx("p", { className: "modal-caption", children: suggestionsContextCount > 0
                                                ? `${t(uiLanguage, "suggestionsCaption")} (${suggestionsContextCount})`
                                                : t(uiLanguage, "suggestionsCaption") })] }), _jsx("button", { className: "secondary-button modal-close-button", type: "button", onClick: () => setIsSuggestionsOpen(false), children: t(uiLanguage, "close") })] }), isSuggestionsLoading ? (_jsxs("div", { className: "suggestions-empty suggestions-loading", children: [_jsx("span", { className: "button-spinner", "aria-hidden": "true" }), _jsx("span", { children: t(uiLanguage, "loadingSuggestions") })] })) : suggestions.length === 0 ? (_jsx("div", { className: "suggestions-empty", children: t(uiLanguage, "suggestionsEmpty") })) : (_jsx("div", { className: "suggestions-modal-grid", children: suggestions.map((suggestion) => (_jsxs("article", { className: "suggestion-card", children: [_jsxs("div", { className: "suggestion-copy", children: [_jsx("p", { dir: suggestion.sourceLanguage === "he" ? "rtl" : "ltr", children: suggestion.sourceText }), _jsx("p", { className: "suggestion-translation", dir: suggestion.targetLanguage === "he" ? "rtl" : "ltr", children: suggestion.targetText })] }), _jsx("button", { className: "suggestion-add-button", type: "button", disabled: savingSuggestionId !== null, onClick: () => void handleSaveSuggestedFlashcard(suggestion), children: _jsxs("span", { className: "button-content", children: [savingSuggestionId === suggestion.id ? _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) : null, _jsx("span", { children: t(uiLanguage, "addSuggestion") })] }) })] }, suggestion.id))) }))] }) })) : null] }));
}
