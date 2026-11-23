import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig(
  { ignores: ["**/dist/**", "**/drizzle/**", ".opencode/**"] },
  tseslint.configs.recommended,
);
