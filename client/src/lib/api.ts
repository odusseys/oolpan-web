import type {
  CurrentUserResponse,
  CreateFlashcardRequest,
  DeckStats,
  DeleteFlashcardResponse,
  FlashcardRecord,
  GoogleAuthConfigResponse,
  GoogleAuthRequest,
  HealthResponse,
  LoginRequest,
  LoginResponse,
  RegisterUserRequest,
  RegisterUserResponse,
  ReviewRequest,
  ReviewResponse,
  SpeechRequest,
  SpeechResponse,
  StudyCard,
  SuggestionsResponse,
  TranslationRequest,
  TranslationResult
} from "@study/shared";

const serverUrl = import.meta.env.VITE_SERVER_URL ?? "";
const SESSION_STORAGE_KEY = "oolpan_session_token";
let authToken = typeof window !== "undefined" ? window.localStorage.getItem(SESSION_STORAGE_KEY) : null;

function authHeaders() {
  return authToken ? ({ Authorization: `Bearer ${authToken}` } as Record<string, string>) : {};
}

async function request<T>(path: string, init?: RequestInit) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders()
  };

  if (init?.headers instanceof Headers) {
    init.headers.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(init?.headers)) {
    for (const [key, value] of init.headers) {
      headers[key] = value;
    }
  } else if (init?.headers) {
    Object.assign(headers, init.headers);
  }

  const response = await fetch(`${serverUrl}${path}`, {
    headers,
    ...init
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(errorBody?.message ?? `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  setSessionToken(token: string | null) {
    authToken = token;
    if (typeof window === "undefined") {
      return;
    }

    if (token) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, token);
      return;
    }

    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  },
  getSessionToken: () => authToken,
  health: () => request<HealthResponse>("/api/health"),
  register: (payload: RegisterUserRequest) =>
    request<RegisterUserResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  login: (payload: LoginRequest) =>
    request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  googleAuthConfig: () => request<GoogleAuthConfigResponse>("/api/auth/google/config"),
  loginWithGoogle: (payload: GoogleAuthRequest) =>
    request<LoginResponse>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  me: () => request<CurrentUserResponse>("/api/auth/me"),
  logout: () =>
    request<void>("/api/auth/logout", {
      method: "POST"
    }),
  translate: (payload: TranslationRequest) =>
    request<TranslationResult>("/api/translate", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  speak: (payload: SpeechRequest) =>
    request<SpeechResponse>("/api/audio/speech", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  createFlashcard: (payload: CreateFlashcardRequest) =>
    request<{ card: FlashcardRecord; stats: DeckStats }>("/api/flashcards", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  suggestions: (sourceLanguage: "en" | "he", targetLanguage: "en" | "he", seed: string) =>
    request<SuggestionsResponse>(
      `/api/suggestions?sourceLanguage=${sourceLanguage}&targetLanguage=${targetLanguage}&seed=${encodeURIComponent(seed)}`
    ),
  nextFlashcard: () => request<StudyCard | null>("/api/flashcards/next"),
  reviewFlashcard: (cardId: number, payload: ReviewRequest) =>
    request<ReviewResponse>(`/api/flashcards/${cardId}/review`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteFlashcard: (cardId: number) =>
    request<DeleteFlashcardResponse>(`/api/flashcards/${cardId}`, {
      method: "DELETE"
    }),
  stats: () => request<DeckStats>("/api/stats")
};

export { serverUrl };
