import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig(
  { ignores: ["**/dist/**", "**/drizzle/**", ".opencode/**", ".agents/skills/**", "**/.hyperframes/**", "video/portfolio/assets/**"] },
  tseslint.configs.recommended,
);
