import type { AppLanguage, StudyCard, SuggestedFlashcard, TranslationResult, User } from "@study/shared";
import { useCallback, useEffect, useState } from "react";
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

export default function App() {
  const uiLanguage: AppLanguage = "en";
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null);
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
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mobileTab, setMobileTab] = useState<MobileTab>("translate");

  const appDirection = "ltr";

  const pushToast = useCallback((message: string, tone: Toast["tone"]) => {
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
      setCurrentCard(response.nextCard);
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
      setCurrentCard(response.nextCard);
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

  async function handleSubmitAuth() {
    try {
      setIsAuthBusy(true);

      if (authMode === "register") {
        const response = await api.register({ username: authUsername });
        api.setSessionToken(response.sessionToken);
        setCurrentUser(response.user);
        setIssuedPassword(response.defaultPassword);
        setAuthPassword("");
      } else {
        const response = await api.login({ username: authUsername, password: authPassword });
        api.setSessionToken(response.sessionToken);
        setCurrentUser(response.user);
        setIssuedPassword(null);
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

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // local reset still matters if the network request fails
    } finally {
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
              disabled={!authUsername.trim() || (authMode === "login" && !authPassword) || isAuthBusy}
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
            </div>
            <div className="learned-counter">
              <span className="learned-counter-label">{t(uiLanguage, "authSignedInAs")}</span>
              <strong>{currentUser.username}</strong>
            </div>
            <button className="secondary-button" type="button" onClick={() => void handleLogout()}>
              <span className="button-content">
                <span>{t(uiLanguage, "authLogout")}</span>
              </span>
            </button>
          </div>
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
            onTextChange={handleInputChange}
            onTranslate={handleTranslate}
            onSwap={swapLanguages}
            onSave={handleSaveFlashcard}
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
            onReveal={() => setIsRevealed(true)}
            onReview={handleReview}
            onRemove={handleRemoveFlashcard}
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
