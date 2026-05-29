export const ARABIC_FORM_IDS = ["isolated", "initial", "medial", "final"];
export const ARABIC_FORM_LABELS = {
    isolated: "Isolated",
    initial: "Initial",
    medial: "Medial",
    final: "Final"
};
export const ARABIC_LETTERS = [
    letter("alif", "ا", rightJoining("ﺍ", "ﺎ"), "alif", "a"),
    letter("ba", "ب", twoWay("ﺏ", "ﺐ", "ﺑ", "ﺒ"), "ba", "b"),
    letter("ta", "ت", twoWay("ﺕ", "ﺖ", "ﺗ", "ﺘ"), "ta", "t"),
    letter("tha", "ث", twoWay("ﺙ", "ﺚ", "ﺛ", "ﺜ"), "tha", "th"),
    letter("jim", "ج", twoWay("ﺝ", "ﺞ", "ﺟ", "ﺠ"), "jim", "j"),
    letter("ha-heavy", "ح", twoWay("ﺡ", "ﺢ", "ﺣ", "ﺤ"), "ha", "ḥ"),
    letter("kha", "خ", twoWay("ﺥ", "ﺦ", "ﺧ", "ﺨ"), "kha", "kh"),
    letter("dal", "د", rightJoining("ﺩ", "ﺪ"), "dal", "d"),
    letter("dhal", "ذ", rightJoining("ﺫ", "ﺬ"), "dhal", "dh"),
    letter("ra", "ر", rightJoining("ﺭ", "ﺮ"), "ra", "r"),
    letter("zay", "ز", rightJoining("ﺯ", "ﺰ"), "zay", "z"),
    letter("sin", "س", twoWay("ﺱ", "ﺲ", "ﺳ", "ﺴ"), "sin", "s"),
    letter("shin", "ش", twoWay("ﺵ", "ﺶ", "ﺷ", "ﺸ"), "shin", "sh"),
    letter("sad", "ص", twoWay("ﺹ", "ﺺ", "ﺻ", "ﺼ"), "sad", "ṣ"),
    letter("dad", "ض", twoWay("ﺽ", "ﺾ", "ﺿ", "ﻀ"), "dad", "ḍ"),
    letter("tah", "ط", twoWay("ﻁ", "ﻂ", "ﻃ", "ﻄ"), "ta", "ṭ"),
    letter("zah", "ظ", twoWay("ﻅ", "ﻆ", "ﻇ", "ﻈ"), "za", "ẓ"),
    letter("ayn", "ع", twoWay("ﻉ", "ﻊ", "ﻋ", "ﻌ"), "ayn", "ʿ"),
    letter("ghayn", "غ", twoWay("ﻍ", "ﻎ", "ﻏ", "ﻐ"), "ghayn", "gh"),
    letter("fa", "ف", twoWay("ﻑ", "ﻒ", "ﻓ", "ﻔ"), "fa", "f"),
    letter("qaf", "ق", twoWay("ﻕ", "ﻖ", "ﻗ", "ﻘ"), "qaf", "q"),
    letter("kaf", "ك", twoWay("ﻙ", "ﻚ", "ﻛ", "ﻜ"), "kaf", "k"),
    letter("lam", "ل", twoWay("ﻝ", "ﻞ", "ﻟ", "ﻠ"), "lam", "l"),
    letter("mim", "م", twoWay("ﻡ", "ﻢ", "ﻣ", "ﻤ"), "mim", "m"),
    letter("nun", "ن", twoWay("ﻥ", "ﻦ", "ﻧ", "ﻨ"), "nun", "n"),
    letter("ha", "ه", twoWay("ﻩ", "ﻪ", "ﻫ", "ﻬ"), "ha", "h"),
    letter("waw", "و", rightJoining("ﻭ", "ﻮ"), "waw", "w"),
    letter("ya", "ي", twoWay("ﻱ", "ﻲ", "ﻳ", "ﻴ"), "ya", "y")
];
export const VOCALIZATIONS = [
    { id: "fatha", mark: "َ", name: "fatha", transliteration: "a" },
    { id: "kasra", mark: "ِ", name: "kasra", transliteration: "i" },
    { id: "damma", mark: "ُ", name: "damma", transliteration: "u" }
];
export const FLASHCARD_PAIRS = ARABIC_LETTERS.flatMap((letter) => VOCALIZATIONS.map((vocalization) => {
    const arabicForms = buildArabicForms(letter, vocalization);
    return {
        id: `${letter.id}-${vocalization.id}`,
        letter,
        vocalization,
        arabicText: arabicForms.isolated,
        arabicForms,
        englishText: transliterate(letter, vocalization)
    };
}));
export const DIRECTED_FLASHCARDS = FLASHCARD_PAIRS.flatMap((pair) => [
    toDirectedFlashcard(pair, "arabic_to_english"),
    toDirectedFlashcard(pair, "english_to_arabic")
]);
function transliterate(letter, vocalization) {
    if (letter.id === "alif") {
        return vocalization.transliteration;
    }
    return `${letter.transliteration}${vocalization.transliteration}`;
}
function toDirectedFlashcard(pair, direction) {
    const isArabicPrompt = direction === "arabic_to_english";
    return {
        key: `${pair.id}:${direction}`,
        pair,
        direction,
        promptText: isArabicPrompt ? pair.arabicText : pair.englishText,
        answerText: isArabicPrompt ? pair.englishText : pair.arabicText,
        promptLanguage: isArabicPrompt ? "arabic" : "english",
        arabicForm: isArabicPrompt ? "isolated" : null
    };
}
export function withRandomArabicPrompt(card) {
    if (card.direction !== "arabic_to_english") {
        return card;
    }
    const arabicForm = randomArabicForm();
    return {
        ...card,
        promptText: card.pair.arabicForms[arabicForm],
        arabicForm
    };
}
function letter(id, arabic, forms, name, transliteration) {
    return { id, arabic, forms, name, transliteration };
}
function twoWay(isolated, final, initial, medial) {
    return { isolated, initial, medial, final };
}
function rightJoining(isolated, final) {
    return { isolated, initial: isolated, medial: final, final };
}
function buildArabicForms(letter, vocalization) {
    return Object.fromEntries(ARABIC_FORM_IDS.map((form) => [form, `${letter.forms[form]}${vocalization.mark}`]));
}
function randomArabicForm() {
    return ARABIC_FORM_IDS[Math.floor(Math.random() * ARABIC_FORM_IDS.length)] ?? "isolated";
}
