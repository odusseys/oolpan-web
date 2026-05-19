import {
  LEARNED_SCORE_THRESHOLD,
  type CreateFlashcardRequest,
  type DeckStats,
  type FlashcardRecord,
  type ReviewDirection,
  type ReviewResult,
  type TranslationResult
} from "@study/shared";
import type { TransactionSql } from "postgres";
import type { DbClient } from "./database.js";
import { db } from "./database.js";
import { DEFAULT_ADAPTIVE_LEARNING_SCORE } from "../lib/scheduler.js";

type FlashcardRow = {
  id: number;
  user_id: number;
  source_text: string;
  source_language: "en" | "he";
  source_transliteration: string | null;
  source_plural_text: string | null;
  source_plural_transliteration: string | null;
  target_text: string;
  target_language: "en" | "he";
  target_transliteration: string | null;
  target_plural_text: string | null;
  target_plural_transliteration: string | null;
  part_of_speech: FlashcardRecord["partOfSpeech"];
  noun_gender: FlashcardRecord["nounGender"];
  image_prompt: string;
  image_data: string | null;
  weight: number;
  review_count: number;
  mistake_count: number;
  consecutive_correct: number;
  source_to_target_weight: number;
  source_to_target_review_count: number;
  source_to_target_mistake_count: number;
  source_to_target_consecutive_correct: number;
  source_to_target_last_reviewed_at: string | null;
  source_to_target_last_result: ReviewResult | null;
  source_to_target_mastered_at: string | null;
  target_to_source_weight: number;
  target_to_source_review_count: number;
  target_to_source_mistake_count: number;
  target_to_source_consecutive_correct: number;
  target_to_source_last_reviewed_at: string | null;
  target_to_source_last_result: ReviewResult | null;
  target_to_source_mastered_at: string | null;
  created_at: string;
  updated_at: string;
  last_reviewed_at: string | null;
  last_result: ReviewResult | null;
  mastered_at: string | null;
  is_active: boolean;
};

type DeckStatsRow = {
  total_cards: number;
  average_weight: number;
  struggling_cards: number;
  due_soon: number;
  learned_words: number;
};

type DbQueryable = DbClient | TransactionSql<Record<string, unknown>>;

function mapRow(row: FlashcardRow): FlashcardRecord {
  return {
    id: row.id,
    sourceText: row.source_text,
    sourceLanguage: row.source_language,
    sourceTransliteration: row.source_transliteration,
    sourcePluralText: row.source_plural_text,
    sourcePluralTransliteration: row.source_plural_transliteration,
    targetText: row.target_text,
    targetLanguage: row.target_language,
    targetTransliteration: row.target_transliteration,
    targetPluralText: row.target_plural_text,
    targetPluralTransliteration: row.target_plural_transliteration,
    partOfSpeech: row.part_of_speech,
    nounGender: row.noun_gender,
    imagePrompt: row.image_prompt,
    imageData: row.image_data,
    weight: row.weight,
    reviewCount: row.review_count,
    mistakeCount: row.mistake_count,
    consecutiveCorrect: row.consecutive_correct,
    sourceToTargetWeight: row.source_to_target_weight,
    sourceToTargetReviewCount: row.source_to_target_review_count,
    sourceToTargetMistakeCount: row.source_to_target_mistake_count,
    sourceToTargetConsecutiveCorrect: row.source_to_target_consecutive_correct,
    sourceToTargetLastReviewedAt: row.source_to_target_last_reviewed_at,
    sourceToTargetLastResult: row.source_to_target_last_result,
    sourceToTargetMasteredAt: row.source_to_target_mastered_at,
    targetToSourceWeight: row.target_to_source_weight,
    targetToSourceReviewCount: row.target_to_source_review_count,
    targetToSourceMistakeCount: row.target_to_source_mistake_count,
    targetToSourceConsecutiveCorrect: row.target_to_source_consecutive_correct,
    targetToSourceLastReviewedAt: row.target_to_source_last_reviewed_at,
    targetToSourceLastResult: row.target_to_source_last_result,
    targetToSourceMasteredAt: row.target_to_source_mastered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastReviewedAt: row.last_reviewed_at,
    lastResult: row.last_result,
    masteredAt: row.mastered_at,
    isActive: row.is_active
  };
}

async function getFlashcardByIdWithClient(sql: DbQueryable, userId: number, id: number) {
  const rows = await sql<FlashcardRow[]>`
    SELECT * FROM flashcards
    WHERE user_id = ${userId} AND id = ${id}
    LIMIT 1
  `;
  const row = rows[0];
  return row ? mapRow(row) : null;
}

async function findFlashcardByPhraseWithClient(
  sql: DbQueryable,
  userId: number,
  translation: TranslationResult | CreateFlashcardRequest
) {
  const rows = await sql<FlashcardRow[]>`
    SELECT * FROM flashcards
    WHERE user_id = ${userId}
      AND source_text = ${translation.sourceText.trim()}
      AND source_language = ${translation.sourceLanguage}
      AND target_text = ${translation.targetText.trim()}
      AND target_language = ${translation.targetLanguage}
    LIMIT 1
  `;

  const row = rows[0];
  return row ? mapRow(row) : null;
}

async function reactivateFlashcardWithClient(
  sql: DbQueryable,
  userId: number,
  id: number,
  input: CreateFlashcardRequest,
  imageData: string | null
) {
  const updatedAt = new Date().toISOString();

  if (imageData) {
    await sql`
      UPDATE flashcards
      SET is_active = TRUE,
          image_data = COALESCE(image_data, ${imageData}),
          source_transliteration = COALESCE(source_transliteration, ${input.sourceTransliteration?.trim() || null}),
          target_transliteration = COALESCE(target_transliteration, ${input.targetTransliteration?.trim() || null}),
          source_plural_text = COALESCE(source_plural_text, ${input.sourcePluralText?.trim() || null}),
          target_plural_text = COALESCE(target_plural_text, ${input.targetPluralText?.trim() || null}),
          source_plural_transliteration = COALESCE(source_plural_transliteration, ${input.sourcePluralTransliteration?.trim() || null}),
          target_plural_transliteration = COALESCE(target_plural_transliteration, ${input.targetPluralTransliteration?.trim() || null}),
          updated_at = ${updatedAt}
      WHERE user_id = ${userId} AND id = ${id}
    `;
    return;
  }

  await sql`
    UPDATE flashcards
    SET is_active = TRUE,
        source_transliteration = COALESCE(source_transliteration, ${input.sourceTransliteration?.trim() || null}),
        target_transliteration = COALESCE(target_transliteration, ${input.targetTransliteration?.trim() || null}),
        source_plural_text = COALESCE(source_plural_text, ${input.sourcePluralText?.trim() || null}),
        target_plural_text = COALESCE(target_plural_text, ${input.targetPluralText?.trim() || null}),
        source_plural_transliteration = COALESCE(source_plural_transliteration, ${input.sourcePluralTransliteration?.trim() || null}),
        target_plural_transliteration = COALESCE(target_plural_transliteration, ${input.targetPluralTransliteration?.trim() || null}),
        updated_at = ${updatedAt}
    WHERE user_id = ${userId} AND id = ${id}
  `;
}

export async function listFlashcards(userId: number) {
  const rows = await db<FlashcardRow[]>`
    SELECT * FROM flashcards
    WHERE user_id = ${userId} AND is_active = TRUE
    ORDER BY created_at DESC
  `;
  return rows.map(mapRow);
}

export async function listRecentFlashcards(userId: number, limit = 5) {
  const rows = await db<FlashcardRow[]>`
    SELECT * FROM flashcards
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(mapRow);
}

export async function getFlashcardById(userId: number, id: number) {
  return getFlashcardByIdWithClient(db, userId, id);
}

export async function findFlashcardByPhrase(userId: number, translation: TranslationResult | CreateFlashcardRequest) {
  return findFlashcardByPhraseWithClient(db, userId, translation);
}

export async function createFlashcard(userId: number, input: CreateFlashcardRequest, imageData: string | null) {
  return db.begin(async (sql) => {
    const existing = await findFlashcardByPhraseWithClient(sql, userId, input);
    if (existing) {
      await reactivateFlashcardWithClient(sql, userId, existing.id, input, imageData);
      return getFlashcardByIdWithClient(sql, userId, existing.id);
    }

    const now = new Date().toISOString();
    const rows = await sql<FlashcardRow[]>`
      INSERT INTO flashcards (
        user_id,
        source_text,
        source_language,
        source_transliteration,
        source_plural_text,
        source_plural_transliteration,
        target_text,
        target_language,
        target_transliteration,
        target_plural_text,
        target_plural_transliteration,
        part_of_speech,
        noun_gender,
        image_prompt,
        image_data,
        weight,
        review_count,
        mistake_count,
        consecutive_correct,
        source_to_target_weight,
        source_to_target_review_count,
        source_to_target_mistake_count,
        source_to_target_consecutive_correct,
        target_to_source_weight,
        target_to_source_review_count,
        target_to_source_mistake_count,
        target_to_source_consecutive_correct,
        created_at,
        updated_at,
        last_reviewed_at,
        last_result
      )
      VALUES (
        ${userId},
        ${input.sourceText.trim()},
        ${input.sourceLanguage},
        ${input.sourceTransliteration?.trim() || null},
        ${input.sourcePluralText?.trim() || null},
        ${input.sourcePluralTransliteration?.trim() || null},
        ${input.targetText.trim()},
        ${input.targetLanguage},
        ${input.targetTransliteration?.trim() || null},
        ${input.targetPluralText?.trim() || null},
        ${input.targetPluralTransliteration?.trim() || null},
        ${input.partOfSpeech},
        ${input.nounGender},
        ${input.imagePrompt ?? ""},
        ${imageData},
        ${DEFAULT_ADAPTIVE_LEARNING_SCORE},
        0,
        0,
        0,
        ${DEFAULT_ADAPTIVE_LEARNING_SCORE},
        0,
        0,
        0,
        ${DEFAULT_ADAPTIVE_LEARNING_SCORE},
        0,
        0,
        0,
        ${now},
        ${now},
        NULL,
        NULL
      )
      RETURNING *
    `;

    const row = rows[0];
    return row ? mapRow(row) : null;
  });
}

export async function updateFlashcardReviewState(
  userId: number,
  id: number,
  direction: ReviewDirection,
  updates: {
    weight: number;
    reviewCount: number;
    mistakeCount: number;
    consecutiveCorrect: number;
    lastReviewedAt: string;
    lastResult: ReviewResult;
    directionMasteredAt?: string | null;
    cardMasteredAt?: string | null;
  }
) {
  const updatedAt = new Date().toISOString();

  if (direction === "source_to_target") {
    const rows = await db<FlashcardRow[]>`
      UPDATE flashcards
      SET source_to_target_weight = ${updates.weight},
          source_to_target_review_count = ${updates.reviewCount},
          source_to_target_mistake_count = ${updates.mistakeCount},
          source_to_target_consecutive_correct = ${updates.consecutiveCorrect},
          source_to_target_last_reviewed_at = ${updates.lastReviewedAt},
          source_to_target_last_result = ${updates.lastResult},
          source_to_target_mastered_at = COALESCE(source_to_target_mastered_at, ${updates.directionMasteredAt ?? null}),
          weight = (${updates.weight} + target_to_source_weight) / 2,
          review_count = ${updates.reviewCount} + target_to_source_review_count,
          mistake_count = ${updates.mistakeCount} + target_to_source_mistake_count,
          consecutive_correct = ${updates.consecutiveCorrect},
          last_reviewed_at = ${updates.lastReviewedAt},
          last_result = ${updates.lastResult},
          mastered_at = COALESCE(mastered_at, ${updates.cardMasteredAt ?? null}),
          updated_at = ${updatedAt}
      WHERE user_id = ${userId} AND id = ${id}
      RETURNING *
    `;

    const row = rows[0];
    return row ? mapRow(row) : null;
  }

  const rows = await db<FlashcardRow[]>`
    UPDATE flashcards
    SET target_to_source_weight = ${updates.weight},
        target_to_source_review_count = ${updates.reviewCount},
        target_to_source_mistake_count = ${updates.mistakeCount},
        target_to_source_consecutive_correct = ${updates.consecutiveCorrect},
        target_to_source_last_reviewed_at = ${updates.lastReviewedAt},
        target_to_source_last_result = ${updates.lastResult},
        target_to_source_mastered_at = COALESCE(target_to_source_mastered_at, ${updates.directionMasteredAt ?? null}),
        weight = (source_to_target_weight + ${updates.weight}) / 2,
        review_count = source_to_target_review_count + ${updates.reviewCount},
        mistake_count = source_to_target_mistake_count + ${updates.mistakeCount},
        consecutive_correct = ${updates.consecutiveCorrect},
        last_reviewed_at = ${updates.lastReviewedAt},
        last_result = ${updates.lastResult},
        mastered_at = COALESCE(mastered_at, ${updates.cardMasteredAt ?? null}),
        updated_at = ${updatedAt}
    WHERE user_id = ${userId} AND id = ${id}
    RETURNING *
  `;

  const row = rows[0];
  return row ? mapRow(row) : null;
}

export async function deleteFlashcard(userId: number, id: number) {
  const updatedAt = new Date().toISOString();
  const rows = await db<{ id: number }[]>`
    UPDATE flashcards
    SET is_active = FALSE,
        weight = 1,
        source_to_target_weight = 1,
        target_to_source_weight = 1,
        updated_at = ${updatedAt}
    WHERE user_id = ${userId} AND id = ${id} AND is_active = TRUE
    RETURNING id
  `;

  return rows.length > 0;
}

export async function getDeckStats(userId: number): Promise<DeckStats> {
  const statsRows = await db<DeckStatsRow[]>`
    SELECT
      COUNT(DISTINCT id) FILTER (WHERE is_active = TRUE)::int AS total_cards,
      COALESCE(AVG(direction_weight) FILTER (WHERE is_active = TRUE), 0)::float8 AS average_weight,
      COUNT(DISTINCT id) FILTER (WHERE is_active = TRUE AND direction_weight <= 0.35)::int AS struggling_cards,
      COUNT(*) FILTER (
        WHERE is_active = TRUE
          AND (
            direction_last_reviewed_at IS NULL
            OR direction_last_reviewed_at <= NOW() - INTERVAL '30 minutes'
          )
      )::int AS due_soon,
      COUNT(DISTINCT id) FILTER (
        WHERE is_active = TRUE
          AND source_to_target_weight > ${LEARNED_SCORE_THRESHOLD}
          AND target_to_source_weight > ${LEARNED_SCORE_THRESHOLD}
      )::int AS learned_words
    FROM flashcards
    CROSS JOIN LATERAL (
      VALUES
        (source_to_target_weight, source_to_target_last_reviewed_at),
        (target_to_source_weight, target_to_source_last_reviewed_at)
    ) AS direction_state(direction_weight, direction_last_reviewed_at)
    WHERE user_id = ${userId}
  `;

  const totals = statsRows[0] ?? {
    total_cards: 0,
    average_weight: 0,
    struggling_cards: 0,
    due_soon: 0,
    learned_words: 0
  };

  return {
    totalCards: totals.total_cards,
    dueSoon: totals.due_soon,
    struggling: totals.struggling_cards,
    averageWeight: Number(totals.average_weight ?? 0),
    learnedWords: totals.learned_words
  };
}
