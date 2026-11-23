import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Client } from "pg";

const root = fileURLToPath(new URL("../../../", import.meta.url));
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const database = new URL(process.env.DATABASE_URL ?? "postgresql://localhost");
if (!process.env.DATABASE_URL || !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
  process.env.NODE_ENV === "production") {
  throw new Error("Las pruebas requieren DATABASE_URL local y un entorno distinto de producción.");
}

const name = `panaderia_e2e_${randomBytes(8).toString("hex")}`;
const temporary = new URL(database);
temporary.pathname = `/${name}`;
const env = {
  ...process.env,
  DATABASE_URL: temporary.href,
  NODE_ENV: "test",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  BETTER_AUTH_URL: "http://127.0.0.1:15174",
  SEED_ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
  CASHIER_EMAIL: "cajero-e2e@example.invalid",
  CASHIER_NAME: "Cajero de prueba",
  CASHIER_PASSWORD: randomBytes(24).toString("base64url"),
  API_HOST: "127.0.0.1",
  API_PORT: "13000",
  WEB_PORT: "15174",
  VITE_HOST: "127.0.0.1",
};
const client = new Client({ connectionString: database.href, connectionTimeoutMillis: 5000 });

const run = (bin, args = [], expectedCode = 0, commandEnv = env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [bin, ...args], { cwd: root, env: commandEnv, stdio: "inherit" });
  child.once("error", reject);
  child.once("exit", (code) => code === expectedCode ? resolve() : reject(new Error(`${bin} terminó con código ${code}; esperado ${expectedCode}.`)));
});

await client.connect();
let created = false;
try {
  // Identificador generado internamente; no se usa el nombre de la base habitual.
  await client.query(`CREATE DATABASE "${name}"`);
  created = true;
  await run("server/dist/migrate.js");
  await run("server/dist/seed-admin.js");
  await run("server/dist/create-cashier.js");
  await run("server/dist/create-cashier.js", [], 2, { ...env, CASHIER_PASSWORD: randomBytes(24).toString("base64url") });
  await run("node_modules/@playwright/test/cli.js", ["test"]);
} finally {
  try { if (created) await client.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
  finally { await client.end(); }
}
