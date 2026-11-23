import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseEnv } from "../env.js";
import * as schema from "./schema.js";

export function connectDatabase() {
  const pool = new Pool({ connectionString: databaseEnv().DATABASE_URL });
  return { db: drizzle(pool, { schema }), pool };
}
