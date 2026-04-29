import type { AppLanguage, StudyCard, SuggestedFlashcard, TranslationResult, User } from "@study/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { StudyPanel } from "./components/StudyPanel";
import { TranslatorPanel } from "./components/TranslatorPanel";
import { api } from "./lib/api";
import { t } from "./lib/copy";

type Toast = {
  id: number;
  message: string;
  tone: "error" | "success";
};

type MobileTab = "translate" | "flashcards";
type AuthMode = "login" | "register";
const AUTO_SPEAK_HEBREW_STORAGE_KEY = "oolpan_auto_speak_hebrew_flashcards";
const AUTO_SPEAK_DELAY_MS = 500;
const IMAGE_CACHE_STORAGE_PREFIX = "oolpan_image_cache";
const AUDIO_CACHE_STORAGE_PREFIX = "oolpan_audio_cache";
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

export default function App() {
  const uiLanguage: AppLanguage = "en";
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
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
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [isReviewBusy, setIsReviewBusy] = useState(false);
  const [pendingReviewResult, setPendingReviewResult] = useState<"oops" | "got_it" | null>(null);
  const [isRemovingCard, setIsRemovingCard] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [loadingAudioKey, setLoadingAudioKey] = useState<string | null>(null);
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
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const lastAutoSpokenOccurrenceRef = useRef<string | null>(null);
  const autoSpeakTimeoutRef = useRef<number | null>(null);
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

  const pushToast = useCallback((message: string, tone: Toast["tone"]) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const hydrateStudyCardImage = useCallback((card: StudyCard | null) => {
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
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
    } finally {
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
      .catch((requestError: Error) => {
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
    if (!isAppMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!headerMenuRef.current?.contains(event.target as Node)) {
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
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
    } finally {
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
      setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
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
      const response = await api.reviewFlashcard(currentCard.id, { result });
      setCurrentCard(hydrateStudyCardImage(response.nextCard));
      setLearnedWords(response.stats.learnedWords);
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
      setCurrentCard(hydrateStudyCardImage(response.nextCard));
      setLearnedWords(response.stats.learnedWords);
      setIsRevealed(false);
      pushToast(t(uiLanguage, "flashcardRemoved"), "success");
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : "Unknown error", "error");
    } finally {
      setIsRemovingCard(false);
    }
  }

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
    if (translationResult) {
      setTranslationResult(null);
    }
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
            <h1>{t(uiLanguage, "authTitle")}</h1>

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

      <header className="app-header">
        <div className="brand-lockup">
          <img className="brand-logo" src="/oolpan-logo.png" alt="Oolpan" />
          <h1 className="sr-only">{t(uiLanguage, "appName")}</h1>
          <div className="header-actions">
            <button
              className="secondary-button top-action-button"
              type="button"
              disabled={isSuggestionsLoading}
              onClick={() => void handleOpenSuggestions()}
            >
              <span className="button-content">
                {isSuggestionsLoading ? <span className="button-spinner" aria-hidden="true" /> : null}
                <span className="button-emoji" aria-hidden="true">
                  💡
                </span>
                <span>{t(uiLanguage, "getSuggestions")}</span>
              </span>
            </button>
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
          </div>
        </div>
        <div className="header-menu-shell" ref={headerMenuRef}>
          <button
            className="menu-trigger header-menu-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={isAppMenuOpen}
            aria-label={t(uiLanguage, "authMenuLabel")}
            onClick={() => setIsAppMenuOpen((current) => !current)}
          >
            ⋯
          </button>
          {isAppMenuOpen ? (
            <div className="menu-popover header-menu-popover" role="menu">
              <button
                className="menu-action header-menu-action"
                type="button"
                onClick={() => {
                  setIsAppMenuOpen(false);
                  setIsLogoutConfirmOpen(true);
                }}
              >
                {t(uiLanguage, "authLogout")}
              </button>
            </div>
          ) : null}
        </div>
      </header>

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

      <div className="mobile-tabs" role="tablist" aria-label="Sections">
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
            onTranslate={handleTranslate}
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
              <div className="suggestions-modal-grid">
                {suggestions.map((suggestion) => (
                  <article key={suggestion.id} className="suggestion-card">
                    <div className="suggestion-copy">
                      <p dir={suggestion.sourceLanguage === "he" ? "rtl" : "ltr"}>{suggestion.sourceText}</p>
                      <p className="suggestion-translation" dir={suggestion.targetLanguage === "he" ? "rtl" : "ltr"}>
                        {suggestion.targetText}
                      </p>
                    </div>
                    <button
                      className="suggestion-add-button"
                      type="button"
                      disabled={savingSuggestionId !== null}
                      onClick={() => void handleSaveSuggestedFlashcard(suggestion)}
                    >
                      <span className="button-content">
                        {savingSuggestionId === suggestion.id ? <span className="button-spinner" aria-hidden="true" /> : null}
                        <span>{t(uiLanguage, "addSuggestion")}</span>
                      </span>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
