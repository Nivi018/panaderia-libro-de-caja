import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { connectDatabase } from "../db/index.js";

// La entrada está en src/scripts en desarrollo y en dist al compilar.
const fromSource = fileURLToPath(new URL("../../drizzle", import.meta.url));
const fromBuild = fileURLToPath(new URL("../drizzle", import.meta.url));
const migrationsFolder = existsSync(fromBuild) ? fromBuild : fromSource;
const { db, pool } = connectDatabase();

try {
  await migrate(db, { migrationsFolder });
  console.log("Migraciones aplicadas.");
} finally {
  await pool.end();
}
