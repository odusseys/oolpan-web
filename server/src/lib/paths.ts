import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function ensureParentDir(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function ensureDir(dirPath: string) {
  mkdirSync(dirPath, { recursive: true });
}

