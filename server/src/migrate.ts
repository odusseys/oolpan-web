import { closeDatabaseConnections } from "./db/database.js";
import { initializeSchema } from "./db/schema.js";

try {
  await initializeSchema();
  console.log("Database schema is up to date.");
} finally {
  await closeDatabaseConnections();
}
