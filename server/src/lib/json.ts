export function extractJsonObject(input: string): Record<string, unknown> {
  const trimmed = input.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No JSON object found in model response");
  }

  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
}

