import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const INPUT_PATH = resolve("data/pealim_dictionary.csv");
const OUTPUT_PATH = resolve("client/public/data/pealim_roots.json");

const NIKUD_RE = /[\u0591-\u05C7]/g;
const HEBREW_LETTER_RE = /[\u05D0-\u05EA]/g;

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(cell);
      cell = "";
      continue;
    }

    cell += char;
  }

  cells.push(cell);
  return cells;
}

function normalizeRoot(value) {
  return Array.from(value.matchAll(HEBREW_LETTER_RE), (match) => match[0]).join("");
}

function stripNikud(value) {
  return value.normalize("NFKD").replace(NIKUD_RE, "").normalize("NFC");
}

function toPartOfSpeech(pos) {
  const normalized = pos.trim().toLowerCase();

  if (normalized === "noun") {
    return "noun";
  }

  if (normalized === "verb") {
    return "verb";
  }

  if (normalized === "adjective") {
    return "adjective";
  }

  if (normalized === "adverb" || normalized === "preposition" || normalized === "conjunction") {
    return "phrase";
  }

  return "other";
}

function toNounGender(gender, partOfSpeech) {
  if (partOfSpeech !== "noun") {
    return null;
  }

  const normalized = gender.trim().toLowerCase();
  if (normalized === "masculine" || normalized === "feminine") {
    return normalized;
  }

  if (normalized === "masc. and fem." || normalized === "common") {
    return "common";
  }

  return "unknown";
}

function getTransitivity(translation) {
  const normalized = translation.toLowerCase();

  if (normalized.includes("(transitive)")) {
    return "transitive";
  }

  if (normalized.includes("(intransitive)")) {
    return "intransitive";
  }

  return null;
}

function parseRows(csvText) {
  const [headerLine, ...lines] = csvText.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headers = parseCsvLine(headerLine);

  return lines
    .filter((line) => line.trim())
    .map((line, rowIndex) => {
      const cells = parseCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
      return { ...row, rowIndex: rowIndex + 2 };
    });
}

function toEntry(row, root) {
  const hebrew = row.hebrew.trim();
  const translation = row.translation.trim();
  const partOfSpeech = toPartOfSpeech(row.pos);

  return {
    id: `${root}:${row.rowIndex}`,
    hebrew,
    hebrewWithoutNikud: stripNikud(hebrew),
    translation,
    partOfSpeech,
    nounGender: toNounGender(row.gender, partOfSpeech),
    metadata: {
      pos: row.pos.trim() || null,
      gender: row.gender.trim() || null,
      verbGroup: row.verb_group.trim() || null,
      pattern: row.pattern.trim() || null,
      number: row.number.trim() || null,
      descriptors: row.other_descriptors.trim() || null,
      transitivity: getTransitivity(translation),
      posRaw: row.pos_raw.trim() || null,
      entryUrl: row.entry_url.trim() || null
    }
  };
}

function sortRoots([left], [right]) {
  return left.localeCompare(right, "he");
}

function sortEntries(left, right) {
  const posOrder = { verb: 0, noun: 1, adjective: 2, phrase: 3, other: 4 };
  const posDelta = posOrder[left.partOfSpeech] - posOrder[right.partOfSpeech];
  if (posDelta !== 0) {
    return posDelta;
  }

  return left.hebrewWithoutNikud.localeCompare(right.hebrewWithoutNikud, "he");
}

async function main() {
  const csvText = await readFile(INPUT_PATH, "utf8");
  const grouped = new Map();
  const seen = new Set();

  for (const row of parseRows(csvText)) {
    const root = normalizeRoot(row.root);
    const hebrew = row.hebrew.trim();
    const translation = row.translation.trim();

    if (!root || !hebrew || !translation) {
      continue;
    }

    const key = `${root}\u0000${stripNikud(hebrew)}\u0000${translation}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const entries = grouped.get(root) ?? [];
    entries.push(toEntry(row, root));
    grouped.set(root, entries);
  }

  const roots = Object.fromEntries(
    Array.from(grouped.entries())
      .sort(sortRoots)
      .map(([root, entries]) => [root, entries.sort(sortEntries)])
  );

  const payload = {
    version: 1,
    source: "data/pealim_dictionary.csv",
    rootCount: Object.keys(roots).length,
    entryCount: Object.values(roots).reduce((total, entries) => total + entries.length, 0),
    roots
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`Wrote ${payload.rootCount} roots and ${payload.entryCount} entries to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
