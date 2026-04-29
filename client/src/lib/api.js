const serverUrl = import.meta.env.VITE_SERVER_URL ?? "";
const SESSION_STORAGE_KEY = "oolpan_session_token";
let authToken = typeof window !== "undefined" ? window.localStorage.getItem(SESSION_STORAGE_KEY) : null;
function authHeaders() {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}
async function request(path, init) {
    const headers = {
        "Content-Type": "application/json",
        ...authHeaders()
    };
    if (init?.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
            headers[key] = value;
        });
    }
    else if (Array.isArray(init?.headers)) {
        for (const [key, value] of init.headers) {
            headers[key] = value;
        }
    }
    else if (init?.headers) {
        Object.assign(headers, init.headers);
    }
    const response = await fetch(`${serverUrl}${path}`, {
        headers,
        ...init
    });
    if (!response.ok) {
        const errorBody = (await response.json().catch(() => null));
        throw new Error(errorBody?.message ?? `Request failed with status ${response.status}`);
    }
    if (response.status === 204) {
        return undefined;
    }
    return (await response.json());
}
export const api = {
    setSessionToken(token) {
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
    health: () => request("/api/health"),
    register: (payload) => request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
    }),
    login: (payload) => request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
    }),
    me: () => request("/api/auth/me"),
    logout: () => request("/api/auth/logout", {
        method: "POST"
    }),
    translate: (payload) => request("/api/translate", {
        method: "POST",
        body: JSON.stringify(payload)
    }),
    createFlashcard: (payload) => request("/api/flashcards", {
        method: "POST",
        body: JSON.stringify(payload)
    }),
    suggestions: (sourceLanguage, targetLanguage, seed) => request(`/api/suggestions?sourceLanguage=${sourceLanguage}&targetLanguage=${targetLanguage}&seed=${encodeURIComponent(seed)}`),
    nextFlashcard: () => request("/api/flashcards/next"),
    reviewFlashcard: (cardId, payload) => request(`/api/flashcards/${cardId}/review`, {
        method: "POST",
        body: JSON.stringify(payload)
    }),
    deleteFlashcard: (cardId) => request(`/api/flashcards/${cardId}`, {
        method: "DELETE"
    }),
    stats: () => request("/api/stats")
};
export { serverUrl };
