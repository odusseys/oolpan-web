import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { StudyPanel } from "./components/StudyPanel";
import { TranslatorPanel } from "./components/TranslatorPanel";
import { api, isUnauthorizedError } from "./lib/api";
import { t } from "./lib/copy";
import { clearLegacyMediaLocalStorage } from "./lib/storageCleanup";
const AUTO_SPEAK_HEBREW_STORAGE_KEY = "oolpan_auto_speak_hebrew_flashcards";
const AUTO_SPEAK_DELAY_MS = 500;
const TRANSLATION_DEBOUNCE_MS = 700;
const MEDIA_CACHE_NAME = "oolpan-media-v1";
const MEDIA_CACHE_ROUTE = "/__oolpan_media";
const MEDIA_CACHE_MAX_ENTRIES = 80;
function suggestionIdentity(suggestion) {
    return `${normalizeSuggestionText(suggestion.sourceText)}::${normalizeSuggestionText(suggestion.targetText)}`;
}
function normalizeSuggestionText(text) {
    return text
        .normalize("NFKD")
        .replace(/\p{Mark}/gu, "")
        .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
        .trim()
        .toLocaleLowerCase();
}
function suggestionDuplicateKeys(suggestion) {
    const source = normalizeSuggestionText(suggestion.sourceText);
    const target = normalizeSuggestionText(suggestion.targetText);
    return [source, target, `${source}::${target}`].filter(Boolean);
}
function suggestionAvoidText(suggestion) {
    if (suggestion.sourceLanguage === "en") {
        return suggestion.sourceText;
    }
    if (suggestion.targetLanguage === "en") {
        return suggestion.targetText;
    }
    return `${suggestion.sourceText} / ${suggestion.targetText}`;
}
function isEditableShortcutTarget(target) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    const tagName = target.tagName.toLowerCase();
    return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}
function canUseServiceWorkerMediaCache() {
    return (typeof window !== "undefined" &&
        "caches" in window &&
        "serviceWorker" in navigator &&
        Boolean(navigator.serviceWorker.controller));
}
async function hashMediaCacheKey(key) {
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
async function getMediaCacheUrl(kind, key) {
    return `${MEDIA_CACHE_ROUTE}/${kind}/${await hashMediaCacheKey(key)}`;
}
async function pruneMediaCache(cache) {
    const keys = await cache.keys();
    const overflowCount = keys.length - MEDIA_CACHE_MAX_ENTRIES;
    if (overflowCount <= 0) {
        return;
    }
    await Promise.all(keys.slice(0, overflowCount).map((request) => cache.delete(request)));
}
async function getCachedMediaUrl(kind, key) {
    if (!canUseServiceWorkerMediaCache()) {
        return null;
    }
    try {
        const cacheUrl = await getMediaCacheUrl(kind, key);
        const cache = await window.caches.open(MEDIA_CACHE_NAME);
        return (await cache.match(cacheUrl)) ? cacheUrl : null;
    }
    catch {
        return null;
    }
}
async function cacheDataUrlAsMedia(kind, key, dataUrl) {
    if (!dataUrl.startsWith("data:") || !canUseServiceWorkerMediaCache()) {
        return dataUrl;
    }
    try {
        const cacheUrl = await getMediaCacheUrl(kind, key);
        const cache = await window.caches.open(MEDIA_CACHE_NAME);
        const existingResponse = await cache.match(cacheUrl);
        if (existingResponse) {
            return cacheUrl;
        }
        const dataResponse = await fetch(dataUrl);
        const mediaBlob = await dataResponse.blob();
        await cache.put(cacheUrl, new Response(mediaBlob, {
            headers: {
                "Cache-Control": "public, max-age=31536000, immutable",
                "Content-Type": mediaBlob.type || "application/octet-stream"
            }
        }));
        await pruneMediaCache(cache);
        return cacheUrl;
    }
    catch {
        return dataUrl;
    }
}
export default function App() {
    const uiLanguage = "en";
    const [currentUser, setCurrentUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [startupError, setStartupError] = useState(null);
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
    const [isSuggestionsMoreLoading, setIsSuggestionsMoreLoading] = useState(false);
    const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
    const [addedSuggestionIds, setAddedSuggestionIds] = useState(() => new Set());
    const [isReviewBusy, setIsReviewBusy] = useState(false);
    const [pendingReviewResult, setPendingReviewResult] = useState(null);
    const [isRemovingCard, setIsRemovingCard] = useState(false);
    const [isRevealed, setIsRevealed] = useState(false);
    const [loadingAudioKey, setLoadingAudioKey] = useState(null);
    const [masteryCelebration, setMasteryCelebration] = useState(null);
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
    const lastAutoSpokenOccurrenceRef = useRef(null);
    const autoSpeakTimeoutRef = useRef(null);
    const liveTranslateTimeoutRef = useRef(null);
    const hasSkippedInitialLiveTranslateRef = useRef(false);
    const latestTranslationRequestRef = useRef(0);
    const latestTranslationInputRef = useRef({
        text,
        sourceLanguage,
        targetLanguage
    });
    const translatorSpeechText = sourceLanguage === "he"
        ? text.trim()
        : translationResult?.targetLanguage === "he"
            ? translationResult.targetText
            : "";
    const translatorSpeechLanguage = sourceLanguage === "he" ? sourceLanguage : (translationResult?.targetLanguage ?? targetLanguage);
    const translationAudioKey = `translator:${translatorSpeechLanguage}:${translatorSpeechText}`;
    const appDirection = "ltr";
    useEffect(() => {
        clearLegacyMediaLocalStorage();
    }, []);
    useEffect(() => {
        latestTranslationInputRef.current = {
            text,
            sourceLanguage,
            targetLanguage
        };
    }, [sourceLanguage, targetLanguage, text]);
    const pushToast = useCallback((message, tone) => {
        const id = Date.now() + Math.random();
        setToasts((current) => [...current, { id, message, tone }]);
        window.setTimeout(() => {
            setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 3200);
    }, []);
    const hydrateStudyCardImage = useCallback(async (card) => {
        if (!card) {
            return card;
        }
        if (!card.imageUrl?.startsWith("data:")) {
            return card;
        }
        const imageCacheKey = `image:${card.imageUrl}`;
        return {
            ...card,
            imageUrl: await cacheDataUrlAsMedia("image", imageCacheKey, card.imageUrl)
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
        setAddedSuggestionIds(new Set());
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
        setCurrentCard(await hydrateStudyCardImage(nextCard));
        setLearnedWords(stats.learnedWords);
    }, [hydrateStudyCardImage]);
    const loadSuggestions = useCallback(async (mode = "replace") => {
        const isAppending = mode === "append";
        const visibleSuggestionKeys = new Set(isAppending ? suggestions.flatMap(suggestionDuplicateKeys) : []);
        const excludedSuggestionTexts = isAppending ? suggestions.map(suggestionAvoidText) : [];
        if (isAppending) {
            setIsSuggestionsMoreLoading(true);
        }
        else {
            setIsSuggestionsLoading(true);
            setSuggestions([]);
            setAddedSuggestionIds(new Set());
        }
        try {
            const collectedSuggestions = [];
            let basedOnCount = suggestionsContextCount;
            for (let attempt = 0; attempt < (isAppending ? 5 : 1); attempt += 1) {
                const response = await api.suggestions(sourceLanguage, targetLanguage, `${Date.now()}-${Math.random()}-${attempt}`, excludedSuggestionTexts);
                basedOnCount = response.basedOnCount;
                for (const suggestion of response.suggestions) {
                    const duplicateKeys = suggestionDuplicateKeys(suggestion);
                    if (duplicateKeys.some((key) => visibleSuggestionKeys.has(key))) {
                        continue;
                    }
                    for (const key of duplicateKeys) {
                        visibleSuggestionKeys.add(key);
                    }
                    collectedSuggestions.push(suggestion);
                }
                if (!isAppending || collectedSuggestions.length >= 10) {
                    break;
                }
            }
            setSuggestions((current) => (isAppending ? [...current, ...collectedSuggestions] : collectedSuggestions));
            setSuggestionsContextCount(basedOnCount);
        }
        catch (requestError) {
            pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
        }
        finally {
            if (isAppending) {
                setIsSuggestionsMoreLoading(false);
            }
            else {
                setIsSuggestionsLoading(false);
            }
        }
    }, [pushToast, sourceLanguage, suggestions, suggestionsContextCount, targetLanguage]);
    useEffect(() => {
        if (!api.getSessionToken()) {
            setIsAuthReady(true);
            return;
        }
        let isCancelled = false;
        void api
            .me()
            .then(async (session) => {
            if (isCancelled) {
                return;
            }
            setCurrentUser(session.user);
            try {
                await loadDeckData();
            }
            catch (requestError) {
                if (isCancelled) {
                    return;
                }
                if (isUnauthorizedError(requestError)) {
                    clearSession();
                    pushToast(t(uiLanguage, "authSessionExpired"), "error");
                    return;
                }
                setStartupError({
                    message: requestError instanceof Error ? requestError.message : "Unknown error"
                });
            }
        })
            .catch((requestError) => {
            if (isCancelled) {
                return;
            }
            if (isUnauthorizedError(requestError)) {
                clearSession();
                pushToast(t(uiLanguage, "authSessionExpired"), "error");
                return;
            }
            setStartupError({
                message: requestError instanceof Error ? requestError.message : "Unknown error"
            });
        })
            .finally(() => {
            if (!isCancelled) {
                setIsAuthReady(true);
            }
        });
        return () => {
            isCancelled = true;
        };
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
        return () => {
            if (autoSpeakTimeoutRef.current !== null) {
                window.clearTimeout(autoSpeakTimeoutRef.current);
            }
            if (liveTranslateTimeoutRef.current !== null) {
                window.clearTimeout(liveTranslateTimeoutRef.current);
            }
            currentAudioRef.current?.pause();
            currentAudioRef.current = null;
        };
    }, []);
    const runTranslation = useCallback(async (input) => {
        const trimmedText = input.text.trim();
        if (!currentUser || !trimmedText) {
            setTranslationResult(null);
            return;
        }
        const requestId = latestTranslationRequestRef.current + 1;
        latestTranslationRequestRef.current = requestId;
        const requestInput = {
            text: trimmedText,
            sourceLanguage: input.sourceLanguage,
            targetLanguage: input.targetLanguage
        };
        try {
            setIsTranslating(true);
            setTranslationResult(null);
            const result = await api.translate(requestInput);
            const latestInput = latestTranslationInputRef.current;
            const isLatestRequest = latestTranslationRequestRef.current === requestId;
            const stillMatchesInput = latestInput.text.trim() === requestInput.text &&
                latestInput.sourceLanguage === requestInput.sourceLanguage &&
                latestInput.targetLanguage === requestInput.targetLanguage;
            if (isLatestRequest && stillMatchesInput) {
                setTranslationResult(result);
            }
        }
        catch (requestError) {
            if (latestTranslationRequestRef.current === requestId) {
                pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
            }
        }
        finally {
            if (latestTranslationRequestRef.current === requestId) {
                setIsTranslating(false);
            }
        }
    }, [currentUser, pushToast]);
    useEffect(() => {
        if (!hasSkippedInitialLiveTranslateRef.current) {
            hasSkippedInitialLiveTranslateRef.current = true;
            return;
        }
        if (!currentUser) {
            return;
        }
        const trimmedText = text.trim();
        if (!trimmedText) {
            latestTranslationRequestRef.current += 1;
            setTranslationResult(null);
            setIsTranslating(false);
            return;
        }
        if (liveTranslateTimeoutRef.current !== null) {
            window.clearTimeout(liveTranslateTimeoutRef.current);
        }
        liveTranslateTimeoutRef.current = window.setTimeout(() => {
            liveTranslateTimeoutRef.current = null;
            void runTranslation({
                text: trimmedText,
                sourceLanguage,
                targetLanguage
            });
        }, TRANSLATION_DEBOUNCE_MS);
        return () => {
            if (liveTranslateTimeoutRef.current !== null) {
                window.clearTimeout(liveTranslateTimeoutRef.current);
                liveTranslateTimeoutRef.current = null;
            }
        };
    }, [currentUser, runTranslation, sourceLanguage, targetLanguage, text]);
    useEffect(() => {
        if (!masteryCelebration) {
            return;
        }
        const timeoutId = window.setTimeout(() => setMasteryCelebration(null), 2000);
        return () => window.clearTimeout(timeoutId);
    }, [masteryCelebration]);
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
            setAddedSuggestionIds((current) => new Set(current).add(suggestion.id));
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
            const response = await api.reviewFlashcard(currentCard.id, { result, direction: currentCard.reviewDirection });
            setCurrentCard(await hydrateStudyCardImage(response.nextCard));
            setLearnedWords(response.stats.learnedWords);
            if (response.masteredFlashcard) {
                setMasteryCelebration(response.masteredFlashcard);
            }
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
            setCurrentCard(await hydrateStudyCardImage(response.nextCard));
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
    useEffect(() => {
        function handleFlashcardShortcut(event) {
            if (event.repeat ||
                event.metaKey ||
                event.ctrlKey ||
                event.altKey ||
                !currentUser ||
                !currentCard ||
                isEditableShortcutTarget(event.target) ||
                isAppMenuOpen ||
                isLogoutConfirmOpen ||
                isHelpOpen ||
                isSuggestionsOpen ||
                isReviewBusy ||
                isRemovingCard) {
                return;
            }
            if (window.matchMedia("(max-width: 980px)").matches && mobileTab !== "flashcards") {
                return;
            }
            if (event.code === "Space" && !isRevealed) {
                event.preventDefault();
                setIsRevealed(true);
                return;
            }
            if (!isRevealed) {
                return;
            }
            const key = event.key.toLowerCase();
            if (key === "g") {
                event.preventDefault();
                void handleReview("got_it");
                return;
            }
            if (key === "o") {
                event.preventDefault();
                void handleReview("oops");
            }
        }
        window.addEventListener("keydown", handleFlashcardShortcut);
        return () => window.removeEventListener("keydown", handleFlashcardShortcut);
    }, [
        currentCard,
        currentUser,
        isAppMenuOpen,
        isHelpOpen,
        isLogoutConfirmOpen,
        isRemovingCard,
        isRevealed,
        isReviewBusy,
        isSuggestionsOpen,
        mobileTab
    ]);
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
            if (!audioUrl) {
                const cachedAudioUrl = await getCachedMediaUrl("audio", key);
                if (cachedAudioUrl) {
                    audioUrlCacheRef.current.set(key, cachedAudioUrl);
                    audioUrl = cachedAudioUrl;
                }
            }
            if (!audioUrl) {
                setLoadingAudioKey(key);
                const response = await api.speak({ text: trimmedText, language });
                audioUrl = await cacheDataUrlAsMedia("audio", key, response.audioUrl);
                audioUrlCacheRef.current.set(key, audioUrl);
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
    }
    if (!isAuthReady) {
        return (_jsxs("div", { className: "app-shell", dir: appDirection, children: [_jsx("div", { className: "background-glow glow-one" }), _jsx("div", { className: "background-glow glow-two" }), _jsx("div", { className: "background-glow glow-three" }), _jsx("div", { className: "background-glow glow-four" }), _jsx("div", { className: "background-glow glow-five" }), _jsx("div", { className: "background-glow glow-six" }), _jsx("main", { className: "auth-shell", children: _jsx("section", { className: "panel auth-panel auth-panel-loading", children: _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) }) })] }));
    }
    if (startupError) {
        return (_jsxs("div", { className: "app-shell", dir: appDirection, children: [_jsx("div", { className: "background-glow glow-one" }), _jsx("div", { className: "background-glow glow-two" }), _jsx("div", { className: "background-glow glow-three" }), _jsx("main", { className: "auth-shell", children: _jsxs("section", { className: "panel auth-panel app-error-panel", children: [_jsx("img", { className: "brand-logo auth-logo", src: "/oolpan-logo.png", alt: "Oolpan" }), _jsx("h1", { children: "Something went wrong" }), _jsx("p", { className: "auth-password-warning", children: "The app could not finish loading. This is usually temporary." }), _jsx("p", { className: "app-error-detail", children: startupError.message }), _jsx("button", { className: "primary-button auth-inline-button", type: "button", onClick: () => window.location.reload(), children: _jsx("span", { className: "button-content", children: _jsx("span", { children: "Reload" }) }) })] }) })] }));
    }
    if (!currentUser) {
        return (_jsxs("div", { className: "app-shell", dir: appDirection, children: [_jsx("div", { className: "background-glow glow-one" }), _jsx("div", { className: "background-glow glow-two" }), _jsx("div", { className: "background-glow glow-three" }), _jsx("div", { className: "background-glow glow-four" }), _jsx("div", { className: "background-glow glow-five" }), _jsx("div", { className: "background-glow glow-six" }), _jsx("div", { className: "toast-stack", "aria-live": "polite", "aria-atomic": "true", children: toasts.map((toast) => (_jsx("div", { className: toast.tone === "error" ? "toast toast-error" : "toast toast-success", children: toast.message }, toast.id))) }), _jsx("main", { className: "auth-shell", children: _jsxs("section", { className: "panel auth-panel", children: [_jsx("img", { className: "brand-logo auth-logo", src: "/oolpan-logo.png", alt: "Oolpan" }), _jsxs("div", { className: "auth-tabs", role: "tablist", "aria-label": "Authentication", children: [_jsx("button", { type: "button", className: authMode === "login" ? "mobile-tab active" : "mobile-tab", onClick: () => setAuthMode("login"), children: t(uiLanguage, "authLoginTab") }), _jsx("button", { type: "button", className: authMode === "register" ? "mobile-tab active" : "mobile-tab", onClick: () => setAuthMode("register"), children: t(uiLanguage, "authRegisterTab") })] }), _jsxs("label", { className: "auth-field", children: [_jsx("span", { children: t(uiLanguage, "authUsernameLabel") }), _jsx("input", { value: authUsername, onChange: (event) => setAuthUsername(event.target.value), placeholder: t(uiLanguage, "authUsernamePlaceholder"), autoCapitalize: "none", autoCorrect: "off" })] }), authMode === "login" ? (_jsxs("label", { className: "auth-field", children: [_jsx("span", { children: t(uiLanguage, "authPasswordLabel") }), _jsx("input", { type: "password", value: authPassword, onChange: (event) => setAuthPassword(event.target.value), placeholder: t(uiLanguage, "authPasswordPlaceholder") })] })) : (_jsx("p", { className: "auth-hint", children: t(uiLanguage, "authRegisterHint") })), _jsx("button", { className: "primary-button auth-submit-button", type: "button", disabled: !authUsername.trim() || (authMode === "login" && !authPassword) || isAuthBusy || isGoogleAuthBusy, onClick: () => void handleSubmitAuth(), children: _jsxs("span", { className: "button-content", children: [isAuthBusy ? _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) : null, _jsx("span", { children: authMode === "register"
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
    return (_jsxs("div", { className: "app-shell", dir: appDirection, children: [_jsx("div", { className: "background-glow glow-one" }), _jsx("div", { className: "background-glow glow-two" }), _jsx("div", { className: "background-glow glow-three" }), _jsx("div", { className: "background-glow glow-four" }), _jsx("div", { className: "background-glow glow-five" }), _jsx("div", { className: "background-glow glow-six" }), masteryCelebration ? (_jsxs("div", { className: "mastery-celebration", "aria-live": "assertive", "aria-atomic": "true", children: [_jsx("div", { className: "firework firework-one", "aria-hidden": "true" }), _jsx("div", { className: "firework firework-two", "aria-hidden": "true" }), _jsx("div", { className: "firework firework-three", "aria-hidden": "true" }), _jsxs("p", { children: [masteryCelebration.text, " mastered!"] })] })) : null, _jsxs("div", { className: "content-frame", children: [_jsxs("header", { className: "app-header", children: [_jsxs("div", { className: "brand-lockup", children: [_jsx("img", { className: "brand-logo", src: "/oolpan-logo.png", alt: "Oolpan" }), _jsx("h1", { className: "sr-only", children: t(uiLanguage, "appName") }), _jsxs("div", { className: "header-actions", children: [_jsxs("div", { className: "learned-counter", children: [_jsx("span", { className: "learned-counter-label", children: t(uiLanguage, "learnedWords") }), _jsx("strong", { children: learnedWords }), _jsx("div", { className: "help-shell", children: _jsx("button", { className: "help-trigger", type: "button", "aria-label": t(uiLanguage, "helpLabel"), "aria-expanded": isHelpOpen, onClick: () => setIsHelpOpen((current) => !current), children: "?" }) })] }), _jsx("button", { className: "secondary-button desktop-suggestions-button", type: "button", disabled: isSuggestionsLoading, onClick: () => void handleOpenSuggestions(), children: _jsxs("span", { className: "button-content", children: [isSuggestionsLoading ? _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) : null, _jsx("span", { children: t(uiLanguage, "getSuggestions") })] }) })] })] }), _jsx("div", { className: "header-menu-shell", children: _jsx("button", { className: "menu-trigger header-menu-trigger", type: "button", "aria-haspopup": "dialog", "aria-expanded": isAppMenuOpen, "aria-controls": "account-menu-modal", "aria-label": t(uiLanguage, "authMenuLabel"), onClick: () => setIsAppMenuOpen((current) => !current), children: "\u22EF" }) })] }), isAppMenuOpen ? (_jsx("div", { className: "modal-backdrop", role: "presentation", onClick: () => setIsAppMenuOpen(false), children: _jsxs("section", { id: "account-menu-modal", className: "modal-panel app-menu-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "account-menu-title", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "section-row modal-header app-menu-modal-header", children: [_jsxs("div", { children: [_jsx("h2", { id: "account-menu-title", children: t(uiLanguage, "authMenuTitle") }), currentUser ? (_jsxs("p", { className: "modal-caption", children: [t(uiLanguage, "authSignedInAs"), " ", currentUser.username] })) : null] }), _jsx("button", { className: "secondary-button modal-close-button app-menu-close-button", type: "button", onClick: () => setIsAppMenuOpen(false), children: t(uiLanguage, "close") })] }), _jsx("div", { className: "app-menu-actions", role: "menu", children: _jsx("button", { className: "menu-action header-menu-action app-menu-action", type: "button", role: "menuitem", onClick: () => {
                                            setIsAppMenuOpen(false);
                                            setIsLogoutConfirmOpen(true);
                                        }, children: t(uiLanguage, "authLogout") }) })] }) })) : null, issuedPassword ? (_jsxs("div", { className: "password-banner", children: [_jsxs("div", { children: [_jsxs("strong", { children: [t(uiLanguage, "authPasswordNotice"), ":"] }), " ", _jsx("span", { children: issuedPassword })] }), _jsx("button", { className: "secondary-button password-banner-button", type: "button", onClick: () => setIssuedPassword(null), children: t(uiLanguage, "authPasswordDismiss") })] })) : null, isLogoutConfirmOpen ? (_jsx("div", { className: "modal-backdrop", role: "presentation", onClick: () => setIsLogoutConfirmOpen(false), children: _jsxs("section", { className: "modal-panel confirm-panel", role: "dialog", "aria-modal": "true", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "confirm-copy", children: [_jsx("h2", { children: t(uiLanguage, "authLogoutConfirmTitle") }), _jsx("p", { className: "modal-caption confirm-body", children: t(uiLanguage, "authLogoutConfirmBody") })] }), _jsxs("div", { className: "confirm-actions", children: [_jsx("button", { className: "secondary-button", type: "button", onClick: () => setIsLogoutConfirmOpen(false), children: _jsx("span", { className: "button-content", children: _jsx("span", { children: t(uiLanguage, "authCancel") }) }) }), _jsx("button", { className: "danger-button", type: "button", onClick: () => void handleLogout(), children: _jsx("span", { className: "button-content", children: _jsx("span", { children: t(uiLanguage, "authConfirmLogout") }) }) })] })] }) })) : null, isHelpOpen ? (_jsx("div", { className: "modal-backdrop", role: "presentation", onClick: () => setIsHelpOpen(false), children: _jsxs("section", { className: "modal-panel help-modal", role: "dialog", "aria-modal": "true", onClick: (event) => event.stopPropagation(), children: [_jsx("div", { className: "confirm-copy", children: _jsx("h2", { children: t(uiLanguage, "helpLabel") }) }), _jsxs("ol", { className: "help-modal-copy", children: [_jsx("li", { children: t(uiLanguage, "helpTranslate") }), _jsx("li", { children: t(uiLanguage, "helpGuess") }), _jsx("li", { children: t(uiLanguage, "helpReview") }), _jsx("li", { children: t(uiLanguage, "helpAdaptive") })] }), _jsx("div", { className: "confirm-actions", children: _jsx("button", { className: "secondary-button", type: "button", onClick: () => setIsHelpOpen(false), children: _jsx("span", { className: "button-content", children: _jsx("span", { children: t(uiLanguage, "close") }) }) }) })] }) })) : null, _jsx("div", { className: "toast-stack", "aria-live": "polite", "aria-atomic": "true", children: toasts.map((toast) => (_jsx("div", { className: toast.tone === "error" ? "toast toast-error" : "toast toast-success", children: toast.message }, toast.id))) }), _jsxs("div", { className: "mobile-tabs", children: [_jsxs("div", { className: "mobile-tab-group", role: "tablist", "aria-label": "Sections", children: [_jsx("button", { type: "button", className: mobileTab === "translate" ? "mobile-tab active" : "mobile-tab", onClick: () => setMobileTab("translate"), children: t(uiLanguage, "translateTab") }), _jsx("button", { type: "button", className: mobileTab === "flashcards" ? "mobile-tab active" : "mobile-tab", onClick: () => setMobileTab("flashcards"), children: t(uiLanguage, "studyTab") })] }), _jsx("button", { className: "secondary-button mobile-suggestions-button", type: "button", disabled: isSuggestionsLoading, "aria-label": t(uiLanguage, "getSuggestions"), title: t(uiLanguage, "getSuggestions"), onClick: () => void handleOpenSuggestions(), children: _jsx("span", { className: "button-content", children: isSuggestionsLoading ? (_jsx("span", { className: "button-spinner", "aria-hidden": "true" })) : (_jsx("span", { className: "button-emoji", "aria-hidden": "true", children: "\uD83D\uDCA1" })) }) })] }), _jsxs("main", { className: "main-grid", children: [_jsx("div", { className: mobileTab === "translate" ? "panel-wrap active-mobile" : "panel-wrap", children: _jsx(TranslatorPanel, { uiLanguage: uiLanguage, sourceLanguage: sourceLanguage, targetLanguage: targetLanguage, text: text, result: translationResult, isTranslating: isTranslating, isSaving: isSavingFlashcard, isSpeakingTranslation: loadingAudioKey === translationAudioKey, onTextChange: handleInputChange, onSwap: swapLanguages, onSave: handleSaveFlashcard, onSpeakTranslation: () => void handleSpeak(translationAudioKey, translatorSpeechText, translatorSpeechLanguage) }) }), _jsx("div", { className: mobileTab === "flashcards" ? "panel-wrap active-mobile" : "panel-wrap", children: _jsx(StudyPanel, { uiLanguage: uiLanguage, card: currentCard, isRevealed: isRevealed, isBusy: isReviewBusy || isRemovingCard, pendingReviewResult: pendingReviewResult, isRemoving: isRemovingCard, loadingAudioKey: loadingAudioKey, autoSpeakHebrew: autoSpeakHebrewFlashcards, onReveal: () => setIsRevealed(true), onReview: handleReview, onRemove: handleRemoveFlashcard, onToggleAutoSpeakHebrew: () => setAutoSpeakHebrewFlashcards((current) => !current), onSpeak: (key, speechText, language) => void handleSpeak(key, speechText, language) }) })] })] }), isSuggestionsOpen ? (_jsx("div", { className: "modal-backdrop", role: "presentation", onClick: () => setIsSuggestionsOpen(false), children: _jsxs("section", { className: "modal-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "suggestions-title", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "section-row modal-header", children: [_jsxs("div", { children: [_jsx("h2", { id: "suggestions-title", children: t(uiLanguage, "suggestionsModalTitle") }), _jsx("p", { className: "modal-caption", children: suggestionsContextCount > 0
                                                ? `${t(uiLanguage, "suggestionsCaption")} (${suggestionsContextCount})`
                                                : t(uiLanguage, "suggestionsCaption") })] }), _jsx("button", { className: "secondary-button modal-close-button", type: "button", onClick: () => setIsSuggestionsOpen(false), children: t(uiLanguage, "close") })] }), isSuggestionsLoading ? (_jsxs("div", { className: "suggestions-empty suggestions-loading", children: [_jsx("span", { className: "button-spinner", "aria-hidden": "true" }), _jsx("span", { children: t(uiLanguage, "loadingSuggestions") })] })) : suggestions.length === 0 ? (_jsx("div", { className: "suggestions-empty", children: t(uiLanguage, "suggestionsEmpty") })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "suggestions-modal-grid", children: suggestions.map((suggestion) => {
                                        const isAdded = addedSuggestionIds.has(suggestion.id);
                                        const isSavingThisSuggestion = savingSuggestionId === suggestion.id;
                                        const suggestionHebrewText = suggestion.sourceLanguage === "he"
                                            ? suggestion.sourceText
                                            : suggestion.targetLanguage === "he"
                                                ? suggestion.targetText
                                                : "";
                                        const suggestionAudioKey = suggestionHebrewText
                                            ? `suggestion:${suggestion.id}:he:${suggestionHebrewText}`
                                            : null;
                                        return (_jsxs("article", { className: isAdded ? "suggestion-card suggestion-card-added" : "suggestion-card", children: [_jsxs("div", { className: "suggestion-copy", children: [_jsx("p", { dir: suggestion.sourceLanguage === "he" ? "rtl" : "ltr", children: suggestion.sourceText }), _jsx("p", { className: "suggestion-translation", dir: suggestion.targetLanguage === "he" ? "rtl" : "ltr", children: suggestion.targetText })] }), _jsxs("div", { className: "suggestion-actions", children: [suggestionAudioKey ? (_jsx("button", { className: "icon-speak-button suggestion-speak-button", type: "button", "aria-label": t(uiLanguage, "playAudio"), title: t(uiLanguage, "playAudio"), disabled: loadingAudioKey !== null, onClick: () => void handleSpeak(suggestionAudioKey, suggestionHebrewText, "he"), children: loadingAudioKey === suggestionAudioKey ? (_jsx("span", { className: "button-spinner", "aria-hidden": "true" })) : (_jsx("span", { "aria-hidden": "true", children: "\uD83D\uDD0A" })) })) : null, _jsx("button", { className: isAdded ? "suggestion-add-button suggestion-add-button-added" : "suggestion-add-button", type: "button", disabled: isAdded || savingSuggestionId !== null, onClick: () => void handleSaveSuggestedFlashcard(suggestion), children: _jsxs("span", { className: "button-content", children: [isSavingThisSuggestion ? _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) : null, isAdded ? _jsx("span", { className: "suggestion-added-check", "aria-hidden": "true", children: "\u2713" }) : null, _jsx("span", { children: isAdded ? t(uiLanguage, "suggestionAddedButton") : t(uiLanguage, "addSuggestion") })] }) })] })] }, suggestion.id));
                                    }) }), _jsx("div", { className: "suggestions-more-row", children: _jsx("button", { className: "secondary-button suggestions-more-button", type: "button", disabled: isSuggestionsMoreLoading || isSuggestionsLoading, onClick: () => void loadSuggestions("append"), children: _jsxs("span", { className: "button-content", children: [isSuggestionsMoreLoading ? _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) : null, _jsx("span", { children: t(uiLanguage, "suggestMore") })] }) }) })] }))] }) })) : null] }));
}
