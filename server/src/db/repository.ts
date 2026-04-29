import type {
  CreateFlashcardRequest,
  DeckStats,
  FlashcardRecord,
  ReviewResult,
  TranslationResult
} from "@study/shared";
import { db } from "./database.js";
import { DEFAULT_ADAPTIVE_LEARNING_SCORE } from "../lib/scheduler.js";

type FlashcardRow = {
  id: number;
  user_id: number;
  source_text: string;
  source_language: "en" | "he";
  target_text: string;
  target_language: "en" | "he";
  part_of_speech: FlashcardRecord["partOfSpeech"];
  noun_gender: FlashcardRecord["nounGender"];
  image_prompt: string;
  image_path: string | null;
  weight: number;
  review_count: number;
  mistake_count: number;
  consecutive_correct: number;
  created_at: string;
  updated_at: string;
  last_reviewed_at: string | null;
  last_result: ReviewResult | null;
  is_active: number;
};

function mapRow(row: FlashcardRow): FlashcardRecord {
  return {
    id: row.id,
    sourceText: row.source_text,
    sourceLanguage: row.source_language,
    targetText: row.target_text,
    targetLanguage: row.target_language,
    partOfSpeech: row.part_of_speech,
    nounGender: row.noun_gender,
    imagePrompt: row.image_prompt,
    imagePath: row.image_path,
    weight: row.weight,
    reviewCount: row.review_count,
    mistakeCount: row.mistake_count,
    consecutiveCorrect: row.consecutive_correct,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastReviewedAt: row.last_reviewed_at,
    lastResult: row.last_result,
    isActive: row.is_active === 1
  };
}

export function listFlashcards(userId: number) {
  const rows = db
    .prepare("SELECT * FROM flashcards WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC")
    .all(userId) as FlashcardRow[];
  return rows.map(mapRow);
}

export function listRecentFlashcards(userId: number, limit = 5) {
  const rows = db
    .prepare("SELECT * FROM flashcards WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT ?")
    .all(userId, limit) as FlashcardRow[];
  return rows.map(mapRow);
}

export function getFlashcardById(userId: number, id: number) {
  const row = db
    .prepare("SELECT * FROM flashcards WHERE user_id = ? AND id = ?")
    .get(userId, id) as FlashcardRow | undefined;
  return row ? mapRow(row) : null;
}

export function findFlashcardByPhrase(userId: number, translation: TranslationResult | CreateFlashcardRequest) {
  const row = db
    .prepare(
      `
        SELECT * FROM flashcards
        WHERE user_id = ?
          AND source_text = ?
          AND source_language = ?
          AND target_text = ?
          AND target_language = ?
      `
    )
    .get(
      userId,
      translation.sourceText.trim(),
      translation.sourceLanguage,
      translation.targetText.trim(),
      translation.targetLanguage
    ) as FlashcardRow | undefined;

  return row ? mapRow(row) : null;
}

export function createFlashcard(userId: number, input: CreateFlashcardRequest, imagePath: string | null) {
  const existing = findFlashcardByPhrase(userId, input);
  if (existing) {
    reactivateFlashcard(userId, existing.id, imagePath);
    return getFlashcardById(userId, existing.id);
  }

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
        INSERT INTO flashcards (
          user_id,
          source_text,
          source_language,
          target_text,
          target_language,
          part_of_speech,
          noun_gender,
          image_prompt,
          image_path,
          weight,
          review_count,
          mistake_count,
          consecutive_correct,
          created_at,
          updated_at,
          last_reviewed_at,
          last_result
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, NULL, NULL)
      `
    )
    .run(
      userId,
      input.sourceText.trim(),
      input.sourceLanguage,
      input.targetText.trim(),
      input.targetLanguage,
      input.partOfSpeech,
      input.nounGender,
      input.imagePrompt,
      imagePath,
      DEFAULT_ADAPTIVE_LEARNING_SCORE,
      now,
      now
    );

  return getFlashcardById(userId, Number(info.lastInsertRowid));
}

function updateFlashcardImage(userId: number, id: number, imagePath: string) {
  db.prepare("UPDATE flashcards SET image_path = ?, updated_at = ? WHERE user_id = ? AND id = ?").run(
    imagePath,
    new Date().toISOString(),
    userId,
    id
  );
}

function reactivateFlashcard(userId: number, id: number, imagePath: string | null) {
  if (imagePath) {
    db.prepare(
      "UPDATE flashcards SET is_active = 1, image_path = COALESCE(image_path, ?), updated_at = ? WHERE user_id = ? AND id = ?"
    ).run(imagePath, new Date().toISOString(), userId, id);
    return;
  }

  db.prepare("UPDATE flashcards SET is_active = 1, updated_at = ? WHERE user_id = ? AND id = ?").run(
    new Date().toISOString(),
    userId,
    id
  );
}

export function updateFlashcardReviewState(
  userId: number,
  id: number,
  updates: {
    weight: number;
    reviewCount: number;
    mistakeCount: number;
    consecutiveCorrect: number;
    lastReviewedAt: string;
    lastResult: ReviewResult;
  }
) {
  db.prepare(
    `
      UPDATE flashcards
      SET weight = ?,
          review_count = ?,
          mistake_count = ?,
          consecutive_correct = ?,
          last_reviewed_at = ?,
          last_result = ?,
          updated_at = ?
      WHERE user_id = ? AND id = ?
    `
  ).run(
    updates.weight,
    updates.reviewCount,
    updates.mistakeCount,
    updates.consecutiveCorrect,
    updates.lastReviewedAt,
    updates.lastResult,
    new Date().toISOString(),
    userId,
    id
  );

  return getFlashcardById(userId, id);
}

export function deleteFlashcard(userId: number, id: number) {
  const info = db
    .prepare("UPDATE flashcards SET is_active = 0, weight = 1, updated_at = ? WHERE user_id = ? AND id = ? AND is_active = 1")
    .run(new Date().toISOString(), userId, id);
  return info.changes > 0;
}

export function getDeckStats(userId: number): DeckStats {
  const totals = db
    .prepare(
      `
        SELECT
          COUNT(*) AS total_cards,
          AVG(weight) AS average_weight,
          SUM(CASE WHEN weight <= 0.35 THEN 1 ELSE 0 END) AS struggling_cards
        FROM flashcards
        WHERE user_id = ? AND is_active = 1
      `
    )
    .get(userId) as {
    total_cards: number;
    average_weight: number | null;
    struggling_cards: number | null;
  };

  const dueSoon = db
    .prepare(
      `
        SELECT COUNT(*) AS due_soon
        FROM flashcards
        WHERE user_id = ? AND is_active = 1
          AND (
            last_reviewed_at IS NULL
            OR datetime(last_reviewed_at) <= datetime('now', '-30 minutes')
          )
      `
    )
    .get(userId) as { due_soon: number };

  const learned = db
    .prepare(
      `
        SELECT COUNT(*) AS learned_words
        FROM flashcards
        WHERE user_id = ? AND weight > 0.8
      `
    )
    .get(userId) as { learned_words: number };

  return {
    totalCards: totals.total_cards,
    dueSoon: dueSoon.due_soon,
    struggling: totals.struggling_cards ?? 0,
    averageWeight: Number((totals.average_weight ?? 0).toFixed(2)),
    learnedWords: learned.learned_words
  };
}
