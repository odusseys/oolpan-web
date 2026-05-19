const LEGACY_MEDIA_STORAGE_PREFIXES = ["oolpan_image_cache:", "oolpan_audio_cache:"];
export function clearLegacyMediaLocalStorage() {
    if (typeof window === "undefined") {
        return;
    }
    try {
        const keysToRemove = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (key && LEGACY_MEDIA_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
                keysToRemove.push(key);
            }
        }
        for (const key of keysToRemove) {
            window.localStorage.removeItem(key);
        }
    }
    catch {
        // Best-effort cleanup. Sessions and preferences should keep working even if storage is unavailable.
    }
}
