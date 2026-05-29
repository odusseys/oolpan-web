#!/usr/bin/env python3
"""Generate an OpenAI translation/transliteration CSV for Levanti samples."""

from __future__ import annotations

import argparse
import asyncio
import csv
import getpass
import json
import os
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd
from huggingface_hub import hf_hub_download
from openai import APIError, AsyncOpenAI, RateLimitError


DATASET_ID = "guymorlan/levanti"
DATASET_FILE = "levanti_v1.csv"
HF_CACHE_DIR = "/private/tmp/hf_home/hub"
MODEL = "gpt-5.5"
OUTPUT_COLUMNS = [
    "dialect",
    "english",
    "arabic gt",
    "arabic predicted",
    "arabic gt transliteration",
    "arabic predicted transliteration",
]

SYSTEM_PROMPT = """You are an expert translator for Arabic dialects and Arabic transliteration.
For the requested dialect:
- Translate the English sentence into natural Arabic script for that dialect.
- Transliterate the provided Arabic ground truth into English-friendly Latin letters.
- Transliterate your Arabic prediction into English-friendly Latin letters.
Use plain Latin transliteration, not IPA. Do not include explanations."""

JSON_SCHEMA = {
    "name": "levanti_translation",
    "schema": {
        "type": "object",
        "properties": {
            "arabic_predicted": {"type": "string"},
            "arabic_gt_transliteration": {"type": "string"},
            "arabic_predicted_transliteration": {"type": "string"},
        },
        "required": [
            "arabic_predicted",
            "arabic_gt_transliteration",
            "arabic_predicted_transliteration",
        ],
        "additionalProperties": False,
    },
    "strict": True,
}


@dataclass(frozen=True)
class SampleRow:
    row_id: int
    dialect: str
    english: str
    arabic_gt: str


@dataclass(frozen=True)
class OutputRow:
    dialect: str
    english: str
    arabic_gt: str
    arabic_predicted: str
    arabic_gt_transliteration: str
    arabic_predicted_transliteration: str

    def as_dict(self) -> dict[str, str]:
        return {
            "dialect": self.dialect,
            "english": self.english,
            "arabic gt": self.arabic_gt,
            "arabic predicted": self.arabic_predicted,
            "arabic gt transliteration": self.arabic_gt_transliteration,
            "arabic predicted transliteration": self.arabic_predicted_transliteration,
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        default="levanti_openai_sample_100.csv",
        help="Output CSV path.",
    )
    parser.add_argument("--sample-size", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--dialect",
        help="Optional exact dialect filter to apply before sampling.",
    )
    parser.add_argument("--concurrency", type=int, default=5)
    parser.add_argument("--max-retries", type=int, default=4)
    return parser.parse_args()


def configure_hf_cache() -> None:
    os.environ.setdefault("HF_HOME", "/private/tmp/hf_home")
    os.environ.setdefault("HF_DATASETS_CACHE", "/private/tmp/hf_datasets_cache")


def get_openai_key() -> str:
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        return key
    return getpass.getpass("OpenAI API key: ")


def load_levanti_frame() -> pd.DataFrame:
    configure_hf_cache()
    csv_path = hf_hub_download(
        DATASET_ID,
        filename=DATASET_FILE,
        repo_type="dataset",
        cache_dir=HF_CACHE_DIR,
    )
    df = pd.read_csv(csv_path, dtype="string")
    required = ["dialect", "english", "arabic"]
    missing = sorted(set(required) - set(df.columns))
    if missing:
        raise ValueError(f"Dataset is missing required columns: {missing}")
    return df.dropna(subset=required)


def sample_rows(df: pd.DataFrame, sample_size: int, seed: int) -> list[SampleRow]:
    if sample_size > len(df):
        raise ValueError(f"Requested {sample_size} rows, but dataset has only {len(df)} rows")
    selected_indices = random.Random(seed).sample(range(len(df)), sample_size)
    selected = df.iloc[selected_indices].reset_index(drop=False)
    return [
        SampleRow(
            row_id=int(row["index"]),
            dialect=str(row["dialect"]),
            english=str(row["english"]),
            arabic_gt=str(row["arabic"]),
        )
        for _, row in selected.iterrows()
    ]


def filter_by_dialect(df: pd.DataFrame, dialect: str | None) -> pd.DataFrame:
    if not dialect:
        return df
    filtered = df[df["dialect"] == dialect]
    if filtered.empty:
        available = ", ".join(sorted(str(value) for value in df["dialect"].unique()))
        raise ValueError(f"No rows found for dialect {dialect!r}. Available: {available}")
    return filtered.reset_index(drop=True)


def make_user_prompt(row: SampleRow) -> str:
    payload = {
        "dialect": row.dialect,
        "english": row.english,
        "arabic_ground_truth": row.arabic_gt,
    }
    return json.dumps(payload, ensure_ascii=False)


def parse_response_content(content: str) -> dict[str, str]:
    parsed = json.loads(content)
    for key in JSON_SCHEMA["schema"]["required"]:
        if not isinstance(parsed.get(key), str) or not parsed[key].strip():
            raise ValueError(f"Response missing non-empty string field {key}: {content}")
    return parsed


async def translate_one(
    client: AsyncOpenAI,
    row: SampleRow,
    semaphore: asyncio.Semaphore,
    max_retries: int,
) -> OutputRow:
    async with semaphore:
        for attempt in range(max_retries + 1):
            try:
                response = await client.chat.completions.create(
                    model=MODEL,
                    reasoning_effort="low",
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": make_user_prompt(row)},
                    ],
                    response_format={"type": "json_schema", "json_schema": JSON_SCHEMA},
                    max_completion_tokens=800,
                    store=False,
                )
                content = response.choices[0].message.content
                if not content:
                    raise ValueError(f"Empty model response for dataset row {row.row_id}")
                parsed = parse_response_content(content)
                return OutputRow(
                    dialect=row.dialect,
                    english=row.english,
                    arabic_gt=row.arabic_gt,
                    arabic_predicted=parsed["arabic_predicted"],
                    arabic_gt_transliteration=parsed["arabic_gt_transliteration"],
                    arabic_predicted_transliteration=parsed[
                        "arabic_predicted_transliteration"
                    ],
                )
            except (APIError, RateLimitError, ValueError, json.JSONDecodeError) as exc:
                if attempt >= max_retries:
                    raise RuntimeError(f"Failed row {row.row_id}: {exc}") from exc
                await asyncio.sleep(min(30, 2**attempt))

    raise AssertionError("unreachable")


async def translate_rows(
    rows: list[SampleRow],
    api_key: str,
    concurrency: int,
    max_retries: int,
) -> list[OutputRow]:
    client = AsyncOpenAI(api_key=api_key)
    semaphore = asyncio.Semaphore(concurrency)

    async def translate_indexed(index: int, row: SampleRow) -> tuple[int, OutputRow]:
        return index, await translate_one(client, row, semaphore, max_retries)

    tasks = [
        asyncio.create_task(translate_indexed(index, row))
        for index, row in enumerate(rows)
    ]
    results: list[OutputRow | None] = [None] * len(rows)
    completed = 0
    for task in asyncio.as_completed(tasks):
        index, result = await task
        results[index] = result
        completed += 1
        print(f"completed {completed}/{len(rows)}", file=sys.stderr, flush=True)

    ordered: list[OutputRow] = []
    for item in results:
        if item is None:
            raise RuntimeError("Internal error: missing translation result")
        ordered.append(item)
    await client.close()
    return ordered


def write_csv(path: Path, rows: list[OutputRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow(row.as_dict())


async def async_main() -> None:
    args = parse_args()
    if args.concurrency < 1:
        raise ValueError("--concurrency must be >= 1")
    df = load_levanti_frame()
    df = filter_by_dialect(df, args.dialect)
    rows = sample_rows(df, args.sample_size, args.seed)
    api_key = get_openai_key()
    output_rows = await translate_rows(
        rows,
        api_key=api_key,
        concurrency=args.concurrency,
        max_retries=args.max_retries,
    )
    write_csv(Path(args.output), output_rows)
    print(f"wrote {len(output_rows)} rows to {args.output}")


def main() -> None:
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
