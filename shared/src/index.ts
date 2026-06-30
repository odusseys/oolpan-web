export const languages = ["en", "he"] as const;

export type AppLanguage = (typeof languages)[number];

export const reviewResults = ["oops", "got_it"] as const;
export type ReviewResult = (typeof reviewResults)[number];
export const reviewDirections = ["source_to_target", "target_to_source"] as const;
export type ReviewDirection = (typeof reviewDirections)[number];
export const LEARNED_SCORE_THRESHOLD = 0.9;

export const partOfSpeechOptions = ["noun", "verb", "adjective", "phrase", "other"] as const;
export type PartOfSpeech = (typeof partOfSpeechOptions)[number];

export const nounGenderOptions = ["masculine", "feminine", "common", "unknown"] as const;
export type NounGender = (typeof nounGenderOptions)[number];

export interface TranslationRequest {
  text: string;
  sourceLanguage: AppLanguage;
  targetLanguage: AppLanguage;
}

export interface SpeechRequest {
  text: string;
  language: AppLanguage;
}

export interface SpeechResponse {
  audioUrl: string;
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
  sourceTransliteration?: string | null;
  targetTransliteration?: string | null;
  sourcePluralText?: string | null;
  targetPluralText?: string | null;
  sourcePluralTransliteration?: string | null;
  targetPluralTransliteration?: string | null;
}

export interface FlashcardRecord {
  id: number;
  sourceText: string;
  sourceLanguage: AppLanguage;
  sourceTransliteration: string | null;
  sourcePluralText: string | null;
  sourcePluralTransliteration: string | null;
  targetText: string;
  targetLanguage: AppLanguage;
  targetTransliteration: string | null;
  targetPluralText: string | null;
  targetPluralTransliteration: string | null;
  partOfSpeech: PartOfSpeech;
  nounGender: NounGender | null;
  imagePrompt: string;
  imageData: string | null;
  weight: number;
  reviewCount: number;
  mistakeCount: number;
  consecutiveCorrect: number;
  sourceToTargetWeight: number;
  sourceToTargetReviewCount: number;
  sourceToTargetMistakeCount: number;
  sourceToTargetConsecutiveCorrect: number;
  sourceToTargetLastReviewedAt: string | null;
  sourceToTargetLastResult: ReviewResult | null;
  sourceToTargetMasteredAt: string | null;
  targetToSourceWeight: number;
  targetToSourceReviewCount: number;
  targetToSourceMistakeCount: number;
  targetToSourceConsecutiveCorrect: number;
  targetToSourceLastReviewedAt: string | null;
  targetToSourceLastResult: ReviewResult | null;
  targetToSourceMasteredAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastReviewedAt: string | null;
  lastResult: ReviewResult | null;
  masteredAt: string | null;
  isActive: boolean;
}

export interface StudyCard extends FlashcardRecord {
  promptSide: "source" | "target";
  reviewDirection: ReviewDirection;
  numberForm: "singular" | "plural";
  promptText: string;
  promptLanguage: AppLanguage;
  promptTransliteration: string | null;
  answerText: string;
  answerLanguage: AppLanguage;
  answerTransliteration: string | null;
  imageUrl: string | null;
  samplingWeight: number;
  directionWeight: number;
  directionReviewCount: number;
}

export interface ReviewRequest {
  result: ReviewResult;
  direction: ReviewDirection;
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
  masteredFlashcard: {
    id: number;
    text: string;
    direction: ReviewDirection;
  } | null;
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

export const authProviders = ["local", "google"] as const;
export type AuthProvider = (typeof authProviders)[number];

export interface User {
  id: number;
  username: string;
  createdAt: string;
  authProvider: AuthProvider;
  email: string | null;
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

export interface GoogleAuthRequest {
  credential: string;
}

export interface GoogleAuthConfigResponse {
  enabled: boolean;
  clientId: string | null;
}

export interface CurrentUserResponse {
  user: User;
}
