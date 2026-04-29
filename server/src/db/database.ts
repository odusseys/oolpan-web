import Database from "better-sqlite3";
import { appConfig } from "../config.js";
import { ensureParentDir } from "../lib/paths.js";

ensureParentDir(appConfig.databasePath);

export const db = new Database(appConfig.databasePath);
db.pragma("journal_mode = WAL");

