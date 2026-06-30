const ROOT_DATA_URL = "/data/pealim_roots.json";
const HEBREW_NIKUD_RE = /[\u0591-\u05C7]/g;
const HEBREW_LETTER_RE = /[\u05D0-\u05EA]/g;
const MAX_ROOT_RESULTS = 24;
export function stripHebrewNikud(value) {
    return value.normalize("NFKD").replace(HEBREW_NIKUD_RE, "").normalize("NFC");
}
export function normalizeHebrewSearch(value) {
    return Array.from(stripHebrewNikud(value).matchAll(HEBREW_LETTER_RE), (match) => match[0]).join("");
}
export async function loadPealimRootGroups() {
    const response = await fetch(ROOT_DATA_URL, {
        headers: {
            Accept: "application/json"
        }
    });
    if (!response.ok) {
        throw new Error(`Could not load root data (${response.status})`);
    }
    const payload = (await response.json());
    return Object.entries(payload.roots).map(([root, entries]) => ({ root, entries }));
}
function getGroupRank(root, entries, query) {
    if (root === query) {
        return 0;
    }
    if (root.startsWith(query)) {
        return 1;
    }
    if (root.includes(query)) {
        return 2;
    }
    if (entries.some((entry) => normalizeHebrewSearch(entry.hebrewWithoutNikud || entry.hebrew) === query)) {
        return 3;
    }
    if (entries.some((entry) => normalizeHebrewSearch(entry.hebrewWithoutNikud || entry.hebrew).startsWith(query))) {
        return 4;
    }
    if (entries.some((entry) => normalizeHebrewSearch(entry.hebrewWithoutNikud || entry.hebrew).includes(query))) {
        return 5;
    }
    return null;
}
export function searchPealimRoots(groups, query) {
    const normalizedQuery = normalizeHebrewSearch(query);
    if (!groups || !normalizedQuery) {
        return [];
    }
    const rankedGroups = [];
    for (const group of groups) {
        const rank = getGroupRank(group.root, group.entries, normalizedQuery);
        if (rank === null) {
            continue;
        }
        rankedGroups.push({ ...group, rank });
    }
    return rankedGroups
        .sort((left, right) => {
        if (left.rank !== right.rank) {
            return left.rank - right.rank;
        }
        return left.root.localeCompare(right.root, "he");
    })
        .slice(0, MAX_ROOT_RESULTS)
        .map(({ rank: _rank, ...group }) => group);
}
export function createFlashcardRequestFromRootEntry(entry) {
    return {
        sourceText: entry.translation.trim(),
        sourceLanguage: "en",
        targetText: stripHebrewNikud(entry.hebrewWithoutNikud || entry.hebrew).trim(),
        targetLanguage: "he",
        partOfSpeech: entry.partOfSpeech,
        nounGender: entry.nounGender,
        isMock: false,
        sourceTransliteration: null,
        targetTransliteration: null
    };
}
