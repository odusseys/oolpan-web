import type { AppLanguage, ReviewDirection, StudyCard, SuggestedFlashcard, TranslationResult, User } from "@study/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { StudyPanel } from "./components/StudyPanel";
import { TranslatorPanel } from "./components/TranslatorPanel";
import { api, isUnauthorizedError } from "./lib/api";
import { t } from "./lib/copy";
import { clearLegacyMediaLocalStorage } from "./lib/storageCleanup";

type Toast = {
  id: number;
  message: string;
  tone: "error" | "success";
};

type MobileTab = "translate" | "flashcards";
type AuthMode = "login" | "register";
type SuggestionLoadMode = "replace" | "append";
type MasteryCelebration = {
  id: number;
  text: string;
  direction: ReviewDirection;
};
type StartupError = {
  message: string;
};
const AUTO_SPEAK_HEBREW_STORAGE_KEY = "oolpan_auto_speak_hebrew_flashcards";
const AUTO_SPEAK_DELAY_MS = 500;
const TRANSLATION_DEBOUNCE_MS = 700;
const MEDIA_CACHE_NAME = "oolpan-media-v1";
const MEDIA_CACHE_ROUTE = "/__oolpan_media";
const MEDIA_CACHE_MAX_ENTRIES = 80;
type GoogleWindow = Window & {
  google?: {
    accounts?: {
      id?: {
        initialize: (options: {
          client_id: string;
          callback: (response: { credential?: string }) => void;
        }) => void;
        renderButton: (
          parent: HTMLElement,
          options: Record<string, string | number | boolean>
        ) => void;
      };
    };
  };
};

function suggestionIdentity(suggestion: Pick<SuggestedFlashcard, "sourceText" | "targetText">) {
  return `${normalizeSuggestionText(suggestion.sourceText)}::${normalizeSuggestionText(suggestion.targetText)}`;
}

function normalizeSuggestionText(text: string) {
  return text
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

function suggestionDuplicateKeys(suggestion: Pick<SuggestedFlashcard, "sourceText" | "targetText">) {
  const source = normalizeSuggestionText(suggestion.sourceText);
  const target = normalizeSuggestionText(suggestion.targetText);
  return [source, target, `${source}::${target}`].filter(Boolean);
}

function suggestionAvoidText(
  suggestion: Pick<SuggestedFlashcard, "sourceText" | "sourceLanguage" | "targetText" | "targetLanguage">
) {
  if (suggestion.sourceLanguage === "en") {
    return suggestion.sourceText;
  }

  if (suggestion.targetLanguage === "en") {
    return suggestion.targetText;
  }

  return `${suggestion.sourceText} / ${suggestion.targetText}`;
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function canUseServiceWorkerMediaCache() {
  return (
    typeof window !== "undefined" &&
    "caches" in window &&
    "serviceWorker" in navigator &&
    Boolean(navigator.serviceWorker.controller)
  );
}

async function hashMediaCacheKey(key: string) {
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getMediaCacheUrl(kind: "audio" | "image", key: string) {
  return `${MEDIA_CACHE_ROUTE}/${kind}/${await hashMediaCacheKey(key)}`;
}

async function pruneMediaCache(cache: Cache) {
  const keys = await cache.keys();
  const overflowCount = keys.length - MEDIA_CACHE_MAX_ENTRIES;
  if (overflowCount <= 0) {
    return;
  }

  await Promise.all(keys.slice(0, overflowCount).map((request) => cache.delete(request)));
}

async function getCachedMediaUrl(kind: "audio" | "image", key: string) {
  if (!canUseServiceWorkerMediaCache()) {
    return null;
  }

  try {
    const cacheUrl = await getMediaCacheUrl(kind, key);
    const cache = await window.caches.open(MEDIA_CACHE_NAME);
    return (await cache.match(cacheUrl)) ? cacheUrl : null;
  } catch {
    return null;
  }
}

async function cacheDataUrlAsMedia(kind: "audio" | "image", key: string, dataUrl: string) {
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
    await cache.put(
      cacheUrl,
      new Response(mediaBlob, {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Type": mediaBlob.type || "application/octet-stream"
        }
      })
    );
    await pruneMediaCache(cache);
    return cacheUrl;
  } catch {
    return dataUrl;
  }
}

export default function App() {
  const uiLanguage: AppLanguage = "en";
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [startupError, setStartupError] = useState<StartupError | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [isGoogleConfigLoading, setIsGoogleConfigLoading] = useState(true);
  const [isGoogleScriptReady, setIsGoogleScriptReady] = useState(false);
  const [isGoogleAuthBusy, setIsGoogleAuthBusy] = useState(false);
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null);
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState<AppLanguage>("en");
  const [targetLanguage, setTargetLanguage] = useState<AppLanguage>("he");
  const [text, setText] = useState("");
  const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedFlashcard[]>([]);
  const [suggestionsContextCount, setSuggestionsContextCount] = useState(0);
  const [currentCard, setCurrentCard] = useState<StudyCard | null>(null);
  const [learnedWords, setLearnedWords] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSavingFlashcard, setIsSavingFlashcard] = useState(false);
  const [savingSuggestionId, setSavingSuggestionId] = useState<string | null>(null);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [isSuggestionsMoreLoading, setIsSuggestionsMoreLoading] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [addedSuggestionIds, setAddedSuggestionIds] = useState<Set<string>>(() => new Set());
  const [isReviewBusy, setIsReviewBusy] = useState(false);
  const [pendingReviewResult, setPendingReviewResult] = useState<"oops" | "got_it" | null>(null);
  const [isRemovingCard, setIsRemovingCard] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [loadingAudioKey, setLoadingAudioKey] = useState<string | null>(null);
  const [masteryCelebration, setMasteryCelebration] = useState<MasteryCelebration | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mobileTab, setMobileTab] = useState<MobileTab>("translate");
  const [autoSpeakHebrewFlashcards, setAutoSpeakHebrewFlashcards] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(AUTO_SPEAK_HEBREW_STORAGE_KEY) === "true";
  });
  const audioUrlCacheRef = useRef(new Map<string, string>());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleInitializedRef = useRef(false);
  const lastAutoSpokenOccurrenceRef = useRef<string | null>(null);
  const autoSpeakTimeoutRef = useRef<number | null>(null);
  const liveTranslateTimeoutRef = useRef<number | null>(null);
  const hasSkippedInitialLiveTranslateRef = useRef(false);
  const latestTranslationRequestRef = useRef(0);
  const latestTranslationInputRef = useRef({
    text,
    sourceLanguage,
    targetLanguage
  });
  const translatorSpeechText =
    sourceLanguage === "he"
      ? text.trim()
      : translationResult?.targetLanguage === "he"
        ? translationResult.targetText
        : "";
  const translatorSpeechLanguage: AppLanguage =
    sourceLanguage === "he" ? sourceLanguage : (translationResult?.targetLanguage ?? targetLanguage);
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

  const pushToast = useCallback((message: string, tone: Toast["tone"]) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const hydrateStudyCardImage = useCallback(async (card: StudyCard | null) => {
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

    const googleWindow = window as GoogleWindow;
    if (googleWindow.google?.accounts?.id) {
      setIsGoogleScriptReady(true);
      return;
    }

    const existingScript = document.getElementById("google-identity-services") as HTMLScriptElement | null;
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

  const loadSuggestions = useCallback(async (mode: SuggestionLoadMode = "replace") => {
    const isAppending = mode === "append";
    const visibleSuggestionKeys = new Set(isAppending ? suggestions.flatMap(suggestionDuplicateKeys) : []);
    const excludedSuggestionTexts = isAppending ? suggestions.map(suggestionAvoidText) : [];

    if (isAppending) {
      setIsSuggestionsMoreLoading(true);
    } else {
      setIsSuggestionsLoading(true);
      setSuggestions([]);
      setAddedSuggestionIds(new Set());
    }

    try {
      const collectedSuggestions: SuggestedFlashcard[] = [];
      let basedOnCount = suggestionsContextCount;

      for (let attempt = 0; attempt < (isAppending ? 5 : 1); attempt += 1) {
        const response = await api.suggestions(
          sourceLanguage,
          targetLanguage,
          `${Date.now()}-${Math.random()}-${attempt}`,
          excludedSuggestionTexts
        );
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
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
    } finally {
      if (isAppending) {
        setIsSuggestionsMoreLoading(false);
      } else {
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
        } catch (requestError) {
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
      .catch((requestError: unknown) => {
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

    function handleKeyDown(event: KeyboardEvent) {
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

    function handleKeyDown(event: KeyboardEvent) {
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

  const runTranslation = useCallback(
    async (input: { text: string; sourceLanguage: AppLanguage; targetLanguage: AppLanguage }) => {
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
        const stillMatchesInput =
          latestInput.text.trim() === requestInput.text &&
          latestInput.sourceLanguage === requestInput.sourceLanguage &&
          latestInput.targetLanguage === requestInput.targetLanguage;

        if (isLatestRequest && stillMatchesInput) {
          setTranslationResult(result);
        }
      } catch (requestError) {
        if (latestTranslationRequestRef.current === requestId) {
          pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
        }
      } finally {
        if (latestTranslationRequestRef.current === requestId) {
          setIsTranslating(false);
        }
      }
    },
    [currentUser, pushToast]
  );

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
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
    } finally {
      setIsSavingFlashcard(false);
    }
  }

  async function handleSaveSuggestedFlashcard(suggestion: SuggestedFlashcard) {
    try {
      setSavingSuggestionId(suggestion.id);
      const response = await api.createFlashcard(suggestion);
      await loadDeckData();
      setLearnedWords(response.stats.learnedWords);
      setIsRevealed(false);
      setAddedSuggestionIds((current) => new Set(current).add(suggestion.id));
      pushToast(t(uiLanguage, "suggestionAdded"), "success");
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
    } finally {
      setSavingSuggestionId(null);
    }
  }

  async function handleReview(result: "oops" | "got_it") {
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
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
    } finally {
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
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
    } finally {
      setIsRemovingCard(false);
    }
  }

  useEffect(() => {
    function handleFlashcardShortcut(event: KeyboardEvent) {
      if (
        event.repeat ||
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
        isRemovingCard
      ) {
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

  const handleSpeak = useCallback(
    async (key: string, speechText: string, language: AppLanguage, options?: { suppressAutoplayError?: boolean }) => {
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
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : "Unknown error";
        const isExpectedAutoplayBlock =
          options?.suppressAutoplayError &&
          typeof message === "string" &&
          (message.includes("user didn't interact with the document first") ||
            message.includes("play() failed because the user didn't interact"));

        if (!isExpectedAutoplayBlock) {
          pushToast(message, "error");
        }
      } finally {
        setLoadingAudioKey((current) => (current === key ? null : current));
      }
    },
    [loadingAudioKey, pushToast]
  );

  useEffect(() => {
    if (autoSpeakTimeoutRef.current !== null) {
      window.clearTimeout(autoSpeakTimeoutRef.current);
      autoSpeakTimeoutRef.current = null;
    }

    if (!currentCard) {
      lastAutoSpokenOccurrenceRef.current = null;
      return;
    }

    let nextAutoSpeakKey: string | null = null;
    let nextOccurrenceKey: string | null = null;
    let nextText = "";
    let nextLanguage: AppLanguage | null = null;

    if (!isRevealed && currentCard.promptLanguage === "he") {
      nextAutoSpeakKey = `flashcard:${currentCard.id}:prompt:${currentCard.promptLanguage}:${currentCard.promptText}`;
      nextOccurrenceKey = `${currentCard.id}:${currentCard.updatedAt}:prompt:${currentCard.promptLanguage}:${currentCard.promptText}`;
      nextText = currentCard.promptText;
      nextLanguage = currentCard.promptLanguage;
    } else if (isRevealed && currentCard.answerLanguage === "he") {
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

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
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
      } catch (requestError) {
        pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
      } finally {
        setIsGoogleAuthBusy(false);
      }
    },
    [loadDeckData, pushToast]
  );

  useEffect(() => {
    if (currentUser || !googleClientId || !isGoogleScriptReady || !googleButtonRef.current) {
      return;
    }

    const googleWindow = window as GoogleWindow;
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
          } else {
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
      } else {
        const response = await api.login({ username: authUsername, password: authPassword });
        api.setSessionToken(response.sessionToken);
        setCurrentUser(response.user);
        setIssuedPassword(null);
        setAuthUsername("");
        setAuthPassword("");
      }

      await loadDeckData();
      setIsAuthReady(true);
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
    } finally {
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
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // local reset still matters if the network request fails
    } finally {
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
    } else {
      setTranslationResult(null);
    }

    setSourceLanguage(nextSource);
    setTargetLanguage(nextTarget);
  }

  function handleInputChange(value: string) {
    setText(value);
  }

  if (!isAuthReady) {
    return (
      <div className="app-shell" dir={appDirection}>
        <div className="background-glow glow-one" />
        <div className="background-glow glow-two" />
        <div className="background-glow glow-three" />
        <div className="background-glow glow-four" />
        <div className="background-glow glow-five" />
        <div className="background-glow glow-six" />
        <main className="auth-shell">
          <section className="panel auth-panel auth-panel-loading">
            <span className="button-spinner" aria-hidden="true" />
          </section>
        </main>
      </div>
    );
  }

  if (startupError) {
    return (
      <div className="app-shell" dir={appDirection}>
        <div className="background-glow glow-one" />
        <div className="background-glow glow-two" />
        <div className="background-glow glow-three" />
        <main className="auth-shell">
          <section className="panel auth-panel app-error-panel">
            <img className="brand-logo auth-logo" src="/oolpan-logo.png" alt="Oolpan" />
            <h1>Something went wrong</h1>
            <p className="auth-password-warning">
              The app could not finish loading. This is usually temporary.
            </p>
            <p className="app-error-detail">{startupError.message}</p>
            <button className="primary-button auth-inline-button" type="button" onClick={() => window.location.reload()}>
              <span className="button-content">
                <span>Reload</span>
              </span>
            </button>
          </section>
        </main>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="app-shell" dir={appDirection}>
        <div className="background-glow glow-one" />
        <div className="background-glow glow-two" />
        <div className="background-glow glow-three" />
        <div className="background-glow glow-four" />
        <div className="background-glow glow-five" />
        <div className="background-glow glow-six" />

        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div key={toast.id} className={toast.tone === "error" ? "toast toast-error" : "toast toast-success"}>
              {toast.message}
            </div>
          ))}
        </div>

        <main className="auth-shell">
          <section className="panel auth-panel">
            <img className="brand-logo auth-logo" src="/oolpan-logo.png" alt="Oolpan" />

            <div className="auth-tabs" role="tablist" aria-label="Authentication">
              <button
                type="button"
                className={authMode === "login" ? "mobile-tab active" : "mobile-tab"}
                onClick={() => setAuthMode("login")}
              >
                {t(uiLanguage, "authLoginTab")}
              </button>
              <button
                type="button"
                className={authMode === "register" ? "mobile-tab active" : "mobile-tab"}
                onClick={() => setAuthMode("register")}
              >
                {t(uiLanguage, "authRegisterTab")}
              </button>
            </div>

            <label className="auth-field">
              <span>{t(uiLanguage, "authUsernameLabel")}</span>
              <input
                value={authUsername}
                onChange={(event) => setAuthUsername(event.target.value)}
                placeholder={t(uiLanguage, "authUsernamePlaceholder")}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </label>

            {authMode === "login" ? (
              <label className="auth-field">
                <span>{t(uiLanguage, "authPasswordLabel")}</span>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder={t(uiLanguage, "authPasswordPlaceholder")}
                />
              </label>
            ) : (
              <p className="auth-hint">{t(uiLanguage, "authRegisterHint")}</p>
            )}

            <button
              className="primary-button auth-submit-button"
              type="button"
              disabled={!authUsername.trim() || (authMode === "login" && !authPassword) || isAuthBusy || isGoogleAuthBusy}
              onClick={() => void handleSubmitAuth()}
            >
              <span className="button-content">
                {isAuthBusy ? <span className="button-spinner" aria-hidden="true" /> : null}
                <span>
                  {authMode === "register"
                    ? isAuthBusy
                      ? t(uiLanguage, "authCreating")
                      : t(uiLanguage, "authCreateAction")
                    : isAuthBusy
                      ? t(uiLanguage, "authLoggingIn")
                      : t(uiLanguage, "authLoginAction")}
                </span>
              </span>
            </button>

            {isGoogleConfigLoading || googleClientId ? (
              <>
                <div className="auth-divider" aria-hidden="true">
                  <span>{t(uiLanguage, "authDivider")}</span>
                </div>
                <div className="google-auth-block">
                  {isGoogleAuthBusy ? (
                    <button className="secondary-button google-auth-fallback-button" type="button" disabled>
                      <span className="button-content">
                        <span className="button-spinner" aria-hidden="true" />
                        <span>{t(uiLanguage, "authGoogleWorking")}</span>
                      </span>
                    </button>
                  ) : isGoogleConfigLoading ? (
                    <div className="google-auth-loading" aria-live="polite">
                      <span className="button-spinner" aria-hidden="true" />
                      <span>{t(uiLanguage, "authGoogleLoading")}</span>
                    </div>
                  ) : (
                    <div
                      ref={googleButtonRef}
                      className="google-signin-button"
                      aria-label={t(uiLanguage, "authGoogleAction")}
                    />
                  )}
                </div>
              </>
            ) : null}
          </section>
        </main>
      </div>
    );
  }

  if (currentUser && issuedPassword) {
    return (
      <div className="app-shell" dir={appDirection}>
        <div className="background-glow glow-one" />
        <div className="background-glow glow-two" />
        <div className="background-glow glow-three" />
        <div className="background-glow glow-four" />
        <div className="background-glow glow-five" />
        <div className="background-glow glow-six" />

        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div key={toast.id} className={toast.tone === "error" ? "toast toast-error" : "toast toast-success"}>
              {toast.message}
            </div>
          ))}
        </div>

        <main className="auth-shell">
          <section className="panel auth-panel">
            <img className="brand-logo auth-logo" src="/oolpan-logo.png" alt="Oolpan" />
            <h1>{t(uiLanguage, "authPasswordScreenTitle")}</h1>
            <p className="auth-password-warning">{t(uiLanguage, "authPasswordScreenBody")}</p>
            <div className="password-card">
              <span className="password-card-label">{t(uiLanguage, "authPasswordNotice")}</span>
              <strong>{issuedPassword}</strong>
              <button className="secondary-button password-card-copy-button" type="button" onClick={() => void handleCopyIssuedPassword()}>
                <span className="button-content">
                  <span>{t(uiLanguage, "authCopyPassword")}</span>
                </span>
              </button>
            </div>
            <div className="auth-actions">
              <button
                className="primary-button auth-inline-button"
                type="button"
                onClick={() => {
                  setIssuedPassword(null);
                  setIsHelpOpen(true);
                }}
              >
                <span className="button-content">
                  <span>{t(uiLanguage, "authContinueToApp")}</span>
                </span>
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell" dir={appDirection}>
      <div className="background-glow glow-one" />
      <div className="background-glow glow-two" />
      <div className="background-glow glow-three" />
      <div className="background-glow glow-four" />
      <div className="background-glow glow-five" />
      <div className="background-glow glow-six" />

      {masteryCelebration ? (
        <div className="mastery-celebration" aria-live="assertive" aria-atomic="true">
          <div className="firework firework-one" aria-hidden="true" />
          <div className="firework firework-two" aria-hidden="true" />
          <div className="firework firework-three" aria-hidden="true" />
          <p>{masteryCelebration.text} mastered!</p>
        </div>
      ) : null}

      <div className="content-frame">
        <header className="app-header">
          <div className="brand-lockup">
            <img className="brand-logo" src="/oolpan-logo.png" alt="Oolpan" />
            <h1 className="sr-only">{t(uiLanguage, "appName")}</h1>
            <div className="header-actions">
              <div className="learned-counter">
                <span className="learned-counter-label">{t(uiLanguage, "learnedWords")}</span>
                <strong>{learnedWords}</strong>
                <div className="help-shell">
                  <button
                    className="help-trigger"
                    type="button"
                    aria-label={t(uiLanguage, "helpLabel")}
                    aria-expanded={isHelpOpen}
                    onClick={() => setIsHelpOpen((current) => !current)}
                  >
                    ?
                  </button>
                </div>
              </div>
              <button
                className="secondary-button desktop-suggestions-button"
                type="button"
                disabled={isSuggestionsLoading}
                onClick={() => void handleOpenSuggestions()}
              >
                <span className="button-content">
                  {isSuggestionsLoading ? <span className="button-spinner" aria-hidden="true" /> : null}
                  <span>{t(uiLanguage, "getSuggestions")}</span>
                </span>
              </button>
            </div>
          </div>
          <div className="header-menu-shell">
            <button
              className="menu-trigger header-menu-trigger"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={isAppMenuOpen}
              aria-controls="account-menu-modal"
              aria-label={t(uiLanguage, "authMenuLabel")}
              onClick={() => setIsAppMenuOpen((current) => !current)}
            >
              ⋯
            </button>
          </div>
        </header>

      {isAppMenuOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsAppMenuOpen(false)}>
          <section
            id="account-menu-modal"
            className="modal-panel app-menu-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-menu-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-row modal-header app-menu-modal-header">
              <div>
                <h2 id="account-menu-title">{t(uiLanguage, "authMenuTitle")}</h2>
                {currentUser ? (
                  <p className="modal-caption">
                    {t(uiLanguage, "authSignedInAs")} {currentUser.username}
                  </p>
                ) : null}
              </div>
              <button
                className="secondary-button modal-close-button app-menu-close-button"
                type="button"
                onClick={() => setIsAppMenuOpen(false)}
              >
                {t(uiLanguage, "close")}
              </button>
            </div>
            <div className="app-menu-actions" role="menu">
              <button
                className="menu-action header-menu-action app-menu-action"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsAppMenuOpen(false);
                  setIsLogoutConfirmOpen(true);
                }}
              >
                {t(uiLanguage, "authLogout")}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {issuedPassword ? (
        <div className="password-banner">
          <div>
            <strong>{t(uiLanguage, "authPasswordNotice")}:</strong> <span>{issuedPassword}</span>
          </div>
          <button className="secondary-button password-banner-button" type="button" onClick={() => setIssuedPassword(null)}>
            {t(uiLanguage, "authPasswordDismiss")}
          </button>
        </div>
      ) : null}

      {isLogoutConfirmOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsLogoutConfirmOpen(false)}>
          <section className="modal-panel confirm-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-copy">
              <h2>{t(uiLanguage, "authLogoutConfirmTitle")}</h2>
              <p className="modal-caption confirm-body">{t(uiLanguage, "authLogoutConfirmBody")}</p>
            </div>
            <div className="confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setIsLogoutConfirmOpen(false)}>
                <span className="button-content">
                  <span>{t(uiLanguage, "authCancel")}</span>
                </span>
              </button>
              <button className="danger-button" type="button" onClick={() => void handleLogout()}>
                <span className="button-content">
                  <span>{t(uiLanguage, "authConfirmLogout")}</span>
                </span>
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isHelpOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsHelpOpen(false)}>
          <section className="modal-panel help-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-copy">
              <h2>{t(uiLanguage, "helpLabel")}</h2>
            </div>
            <ol className="help-modal-copy">
              <li>{t(uiLanguage, "helpTranslate")}</li>
              <li>{t(uiLanguage, "helpGuess")}</li>
              <li>{t(uiLanguage, "helpReview")}</li>
              <li>{t(uiLanguage, "helpAdaptive")}</li>
            </ol>
            <div className="confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setIsHelpOpen(false)}>
                <span className="button-content">
                  <span>{t(uiLanguage, "close")}</span>
                </span>
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={toast.tone === "error" ? "toast toast-error" : "toast toast-success"}>
            {toast.message}
          </div>
        ))}
      </div>

        <div className="mobile-tabs">
          <div className="mobile-tab-group" role="tablist" aria-label="Sections">
            <button
              type="button"
              className={mobileTab === "translate" ? "mobile-tab active" : "mobile-tab"}
              onClick={() => setMobileTab("translate")}
            >
              {t(uiLanguage, "translateTab")}
            </button>
            <button
              type="button"
              className={mobileTab === "flashcards" ? "mobile-tab active" : "mobile-tab"}
              onClick={() => setMobileTab("flashcards")}
            >
              {t(uiLanguage, "studyTab")}
            </button>
          </div>
          <button
            className="secondary-button mobile-suggestions-button"
            type="button"
            disabled={isSuggestionsLoading}
            aria-label={t(uiLanguage, "getSuggestions")}
            title={t(uiLanguage, "getSuggestions")}
            onClick={() => void handleOpenSuggestions()}
          >
            <span className="button-content">
              {isSuggestionsLoading ? (
                <span className="button-spinner" aria-hidden="true" />
              ) : (
                <span className="button-emoji" aria-hidden="true">
                  💡
                </span>
              )}
            </span>
          </button>
        </div>

        <main className="main-grid">
          <div className={mobileTab === "translate" ? "panel-wrap active-mobile" : "panel-wrap"}>
            <TranslatorPanel
              uiLanguage={uiLanguage}
              sourceLanguage={sourceLanguage}
              targetLanguage={targetLanguage}
              text={text}
              result={translationResult}
              isTranslating={isTranslating}
              isSaving={isSavingFlashcard}
              isSpeakingTranslation={loadingAudioKey === translationAudioKey}
              onTextChange={handleInputChange}
              onSwap={swapLanguages}
              onSave={handleSaveFlashcard}
              onSpeakTranslation={() =>
                void handleSpeak(translationAudioKey, translatorSpeechText, translatorSpeechLanguage)
              }
            />
          </div>

          <div className={mobileTab === "flashcards" ? "panel-wrap active-mobile" : "panel-wrap"}>
            <StudyPanel
              uiLanguage={uiLanguage}
              card={currentCard}
              isRevealed={isRevealed}
              isBusy={isReviewBusy || isRemovingCard}
              pendingReviewResult={pendingReviewResult}
              isRemoving={isRemovingCard}
              loadingAudioKey={loadingAudioKey}
              autoSpeakHebrew={autoSpeakHebrewFlashcards}
              onReveal={() => setIsRevealed(true)}
              onReview={handleReview}
              onRemove={handleRemoveFlashcard}
              onToggleAutoSpeakHebrew={() => setAutoSpeakHebrewFlashcards((current) => !current)}
              onSpeak={(key, speechText, language) => void handleSpeak(key, speechText, language)}
            />
          </div>
        </main>
      </div>

      {isSuggestionsOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsSuggestionsOpen(false)}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="suggestions-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-row modal-header">
              <div>
                <h2 id="suggestions-title">{t(uiLanguage, "suggestionsModalTitle")}</h2>
                <p className="modal-caption">
                  {suggestionsContextCount > 0
                    ? `${t(uiLanguage, "suggestionsCaption")} (${suggestionsContextCount})`
                    : t(uiLanguage, "suggestionsCaption")}
                </p>
              </div>
              <button className="secondary-button modal-close-button" type="button" onClick={() => setIsSuggestionsOpen(false)}>
                {t(uiLanguage, "close")}
              </button>
            </div>

            {isSuggestionsLoading ? (
              <div className="suggestions-empty suggestions-loading">
                <span className="button-spinner" aria-hidden="true" />
                <span>{t(uiLanguage, "loadingSuggestions")}</span>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="suggestions-empty">{t(uiLanguage, "suggestionsEmpty")}</div>
            ) : (
              <>
                <div className="suggestions-modal-grid">
                  {suggestions.map((suggestion) => {
                    const isAdded = addedSuggestionIds.has(suggestion.id);
                    const isSavingThisSuggestion = savingSuggestionId === suggestion.id;
                    const suggestionHebrewText =
                      suggestion.sourceLanguage === "he"
                        ? suggestion.sourceText
                        : suggestion.targetLanguage === "he"
                          ? suggestion.targetText
                          : "";
                    const suggestionAudioKey = suggestionHebrewText
                      ? `suggestion:${suggestion.id}:he:${suggestionHebrewText}`
                      : null;

                    return (
                      <article key={suggestion.id} className={isAdded ? "suggestion-card suggestion-card-added" : "suggestion-card"}>
                        <div className="suggestion-copy">
                          <p dir={suggestion.sourceLanguage === "he" ? "rtl" : "ltr"}>{suggestion.sourceText}</p>
                          <p className="suggestion-translation" dir={suggestion.targetLanguage === "he" ? "rtl" : "ltr"}>
                            {suggestion.targetText}
                          </p>
                        </div>
                        <div className="suggestion-actions">
                          {suggestionAudioKey ? (
                            <button
                              className="icon-speak-button suggestion-speak-button"
                              type="button"
                              aria-label={t(uiLanguage, "playAudio")}
                              title={t(uiLanguage, "playAudio")}
                              disabled={loadingAudioKey !== null}
                              onClick={() => void handleSpeak(suggestionAudioKey, suggestionHebrewText, "he")}
                            >
                              {loadingAudioKey === suggestionAudioKey ? (
                                <span className="button-spinner" aria-hidden="true" />
                              ) : (
                                <span aria-hidden="true">🔊</span>
                              )}
                            </button>
                          ) : null}
                          <button
                            className={isAdded ? "suggestion-add-button suggestion-add-button-added" : "suggestion-add-button"}
                            type="button"
                            disabled={isAdded || savingSuggestionId !== null}
                            onClick={() => void handleSaveSuggestedFlashcard(suggestion)}
                          >
                            <span className="button-content">
                              {isSavingThisSuggestion ? <span className="button-spinner" aria-hidden="true" /> : null}
                              {isAdded ? <span className="suggestion-added-check" aria-hidden="true">✓</span> : null}
                              <span>{isAdded ? t(uiLanguage, "suggestionAddedButton") : t(uiLanguage, "addSuggestion")}</span>
                            </span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className="suggestions-more-row">
                  <button
                    className="secondary-button suggestions-more-button"
                    type="button"
                    disabled={isSuggestionsMoreLoading || isSuggestionsLoading}
                    onClick={() => void loadSuggestions("append")}
                  >
                    <span className="button-content">
                      {isSuggestionsMoreLoading ? <span className="button-spinner" aria-hidden="true" /> : null}
                      <span>{t(uiLanguage, "suggestMore")}</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
