import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { connectDatabase } from "./db/index.js";
import type { serverEnv } from "./env.js";
import { account, session, user, verification } from "./db/schema.js";

export function createAuth(db: ReturnType<typeof connectDatabase>["db"], env: ReturnType<typeof serverEnv>) {
  return betterAuth({
    appName: env.BAKERY_NAME,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
    database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
    advanced: { useSecureCookies: env.NODE_ENV === "production" },
    user: {
      additionalFields: {
        role: { type: ["admin", "cajero"], required: true, input: false, defaultValue: "cajero" },
      },
    },
  });
}
