import type {
  CreateFlashcardRequest,
  DeckStats,
  FlashcardRecord,
  ReviewResult,
  TranslationResult
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
  target_text: string;
  target_language: "en" | "he";
  part_of_speech: FlashcardRecord["partOfSpeech"];
  noun_gender: FlashcardRecord["nounGender"];
  image_prompt: string;
  image_data: string | null;
  weight: number;
  review_count: number;
  mistake_count: number;
  consecutive_correct: number;
  created_at: string;
  updated_at: string;
  last_reviewed_at: string | null;
  last_result: ReviewResult | null;
  is_active: boolean;
};

type DeckTotalsRow = {
  total_cards: number;
  average_weight: number;
  struggling_cards: number;
};

type CountRow = {
  count: number;
};

type DbQueryable = DbClient | TransactionSql<Record<string, unknown>>;

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
    imageData: row.image_data,
    weight: row.weight,
    reviewCount: row.review_count,
    mistakeCount: row.mistake_count,
    consecutiveCorrect: row.consecutive_correct,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastReviewedAt: row.last_reviewed_at,
    lastResult: row.last_result,
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

async function reactivateFlashcardWithClient(sql: DbQueryable, userId: number, id: number, imageData: string | null) {
  const updatedAt = new Date().toISOString();

  if (imageData) {
    await sql`
      UPDATE flashcards
      SET is_active = TRUE,
          image_data = COALESCE(image_data, ${imageData}),
          updated_at = ${updatedAt}
      WHERE user_id = ${userId} AND id = ${id}
    `;
    return;
  }

  await sql`
    UPDATE flashcards
    SET is_active = TRUE,
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
      await reactivateFlashcardWithClient(sql, userId, existing.id, imageData);
      return getFlashcardByIdWithClient(sql, userId, existing.id);
    }

    const now = new Date().toISOString();
    const rows = await sql<FlashcardRow[]>`
      INSERT INTO flashcards (
        user_id,
        source_text,
        source_language,
        target_text,
        target_language,
        part_of_speech,
        noun_gender,
        image_prompt,
        image_data,
        weight,
        review_count,
        mistake_count,
        consecutive_correct,
        created_at,
        updated_at,
        last_reviewed_at,
        last_result
      )
      VALUES (
        ${userId},
        ${input.sourceText.trim()},
        ${input.sourceLanguage},
        ${input.targetText.trim()},
        ${input.targetLanguage},
        ${input.partOfSpeech},
        ${input.nounGender},
        ${input.imagePrompt ?? ""},
        ${imageData},
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
  updates: {
    weight: number;
    reviewCount: number;
    mistakeCount: number;
    consecutiveCorrect: number;
    lastReviewedAt: string;
    lastResult: ReviewResult;
  }
) {
  const updatedAt = new Date().toISOString();
  const rows = await db<FlashcardRow[]>`
    UPDATE flashcards
    SET weight = ${updates.weight},
        review_count = ${updates.reviewCount},
        mistake_count = ${updates.mistakeCount},
        consecutive_correct = ${updates.consecutiveCorrect},
        last_reviewed_at = ${updates.lastReviewedAt},
        last_result = ${updates.lastResult},
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
        updated_at = ${updatedAt}
    WHERE user_id = ${userId} AND id = ${id} AND is_active = TRUE
    RETURNING id
  `;

  return rows.length > 0;
}

export async function getDeckStats(userId: number): Promise<DeckStats> {
  const totalsRows = await db<DeckTotalsRow[]>`
    SELECT
      COUNT(*)::int AS total_cards,
      COALESCE(AVG(weight), 0)::float8 AS average_weight,
      COUNT(*) FILTER (WHERE weight <= 0.35)::int AS struggling_cards
    FROM flashcards
    WHERE user_id = ${userId} AND is_active = TRUE
  `;

  const dueSoonRows = await db<CountRow[]>`
    SELECT COUNT(*)::int AS count
    FROM flashcards
    WHERE user_id = ${userId}
      AND is_active = TRUE
      AND (
        last_reviewed_at IS NULL
        OR last_reviewed_at <= NOW() - INTERVAL '30 minutes'
      )
  `;

  const learnedRows = await db<CountRow[]>`
    SELECT COUNT(*)::int AS count
    FROM flashcards
    WHERE user_id = ${userId} AND weight > 0.8
  `;

  const totals = totalsRows[0] ?? {
    total_cards: 0,
    average_weight: 0,
    struggling_cards: 0
  };

  return {
    totalCards: totals.total_cards,
    dueSoon: dueSoonRows[0]?.count ?? 0,
    struggling: totals.struggling_cards,
    averageWeight: Number(totals.average_weight ?? 0),
    learnedWords: learnedRows[0]?.count ?? 0
  };
}
