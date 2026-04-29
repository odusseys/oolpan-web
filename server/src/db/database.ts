import postgres, { type Sql } from "postgres";
import { appConfig } from "../config.js";

export type DbClient = Sql<Record<string, unknown>>;

function createClient(connectionString: string) {
  return postgres(connectionString, {
    prepare: false,
    ssl: "require"
  });
}

export const db = createClient(appConfig.databaseUrl);
export const adminDb = appConfig.databaseUrlUnpooled === appConfig.databaseUrl ? db : createClient(appConfig.databaseUrlUnpooled);

export async function closeDatabaseConnections() {
  await db.end({ timeout: 5 });
  if (adminDb !== db) {
    await adminDb.end({ timeout: 5 });
  }
}
