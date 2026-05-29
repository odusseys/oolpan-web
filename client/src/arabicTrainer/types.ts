export type ReviewDirection = "arabic_to_english" | "english_to_arabic";

export type ReviewResult = "oops" | "got_it";

export type ArabicLetterForm = "isolated" | "initial" | "medial" | "final";

export type ArabicLetter = {
  id: string;
  arabic: string;
  forms: Record<ArabicLetterForm, string>;
  name: string;
  transliteration: string;
};

export type Vocalization = {
  id: string;
  mark: string;
  name: string;
  transliteration: string;
};

export type FlashcardPair = {
  id: string;
  letter: ArabicLetter;
  vocalization: Vocalization;
  arabicText: string;
  arabicForms: Record<ArabicLetterForm, string>;
  englishText: string;
};

export type DirectedFlashcard = {
  key: string;
  pair: FlashcardPair;
  direction: ReviewDirection;
  promptText: string;
  answerText: string;
  promptLanguage: "arabic" | "english";
  arabicForm: ArabicLetterForm | null;
};

export type ReviewStat = {
  key: string;
  score: number;
  reviewCount: number;
  mistakeCount: number;
  streak: number;
  lastResult: ReviewResult | null;
  lastReviewedAt: number | null;
};
