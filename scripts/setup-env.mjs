import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const target = new URL("../.env", import.meta.url);
const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const content = example
  .replaceAll("CAMBIAR_PASSWORD_DB", randomBytes(24).toString("hex"))
  .replace("CAMBIAR_SECRET", randomBytes(32).toString("hex"))
  .replace("SEED_ADMIN_PASSWORD=", `SEED_ADMIN_PASSWORD=${randomBytes(24).toString("base64url")}`);

try {
  await writeFile(target, content, { flag: "wx", mode: 0o600 });
  console.log(".env creado con credenciales locales aleatorias.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log(".env ya existe; no se modificó.");
}
