export const languages = ["en", "he"] as const;

export type AppLanguage = (typeof languages)[number];

export const reviewResults = ["oops", "got_it"] as const;
export type ReviewResult = (typeof reviewResults)[number];

export const partOfSpeechOptions = ["noun", "verb", "adjective", "phrase", "other"] as const;
export type PartOfSpeech = (typeof partOfSpeechOptions)[number];

export const nounGenderOptions = ["masculine", "feminine", "common", "unknown"] as const;
export type NounGender = (typeof nounGenderOptions)[number];

export interface TranslationRequest {
  text: string;
  sourceLanguage: AppLanguage;
  targetLanguage: AppLanguage;
}

export interface TranslationResult {
  sourceText: string;
  sourceLanguage: AppLanguage;
  targetText: string;
  targetLanguage: AppLanguage;
  partOfSpeech: PartOfSpeech;
  nounGender: NounGender | null;
  isMock: boolean;
}

export interface CreateFlashcardRequest extends TranslationResult {
  imagePrompt?: string;
}

export interface FlashcardRecord {
  id: number;
  sourceText: string;
  sourceLanguage: AppLanguage;
  targetText: string;
  targetLanguage: AppLanguage;
  partOfSpeech: PartOfSpeech;
  nounGender: NounGender | null;
  imagePrompt: string;
  imagePath: string | null;
  weight: number;
  reviewCount: number;
  mistakeCount: number;
  consecutiveCorrect: number;
  createdAt: string;
  updatedAt: string;
  lastReviewedAt: string | null;
  lastResult: ReviewResult | null;
  isActive: boolean;
}

export interface StudyCard extends FlashcardRecord {
  promptSide: "source" | "target";
  promptText: string;
  promptLanguage: AppLanguage;
  answerText: string;
  answerLanguage: AppLanguage;
  imageUrl: string | null;
  samplingWeight: number;
}

export interface ReviewRequest {
  result: ReviewResult;
}

export interface DeckStats {
  totalCards: number;
  dueSoon: number;
  struggling: number;
  averageWeight: number;
  learnedWords: number;
}

export interface ReviewResponse {
  updatedCard: FlashcardRecord;
  nextCard: StudyCard | null;
  stats: DeckStats;
}

export interface HealthResponse {
  ok: true;
  aiMode: "mock" | "openai-compatible";
}

export interface SuggestedFlashcard extends CreateFlashcardRequest {
  id: string;
}

export interface SuggestionsResponse {
  suggestions: SuggestedFlashcard[];
  basedOnCount: number;
}

export interface DeleteFlashcardResponse {
  removedId: number;
  nextCard: StudyCard | null;
  stats: DeckStats;
}

export interface User {
  id: number;
  username: string;
  createdAt: string;
}

export interface RegisterUserRequest {
  username: string;
}

export interface RegisterUserResponse {
  user: User;
  sessionToken: string;
  defaultPassword: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  sessionToken: string;
}

export interface CurrentUserResponse {
  user: User;
}
