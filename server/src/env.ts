import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("es-MX", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const databaseEnv = () => z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
}).parse({ DATABASE_URL: process.env.DATABASE_URL });

export const serverEnv = () => z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }).refine((value) => {
    const url = new URL(value);
    return url.toString() === `${url.origin}/`;
  }, "Debe ser el origen público, sin ruta, credenciales ni parámetros."),
  BETTER_AUTH_SECRET: z.string().min(32),
  BAKERY_NAME: z.string().trim().min(1).default("Panadería"),
  BAKERY_TIME_ZONE: z.string().refine(validTimeZone, "Zona horaria no válida.").default("America/Mexico_City"),
}).refine(
  (env) => env.NODE_ENV !== "production" || new URL(env.BETTER_AUTH_URL).protocol === "https:",
  { path: ["BETTER_AUTH_URL"], message: "Producción requiere HTTPS." },
).parse(process.env);
