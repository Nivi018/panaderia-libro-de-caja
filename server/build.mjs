import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const manifest = JSON.parse(await readFile(new URL("package.json", import.meta.url), "utf8"));

await build({
  entryPoints: {
    index: "src/index.ts",
    migrate: "src/scripts/migrate.ts",
    "seed-admin": "src/scripts/seed-admin.ts",
    "create-cashier": "src/scripts/create-cashier.ts",
  },
  outdir: "dist",
  platform: "node",
  format: "esm",
  target: "node22",
  bundle: true,
  sourcemap: true,
  external: Object.keys(manifest.dependencies).filter((name) => !name.startsWith("@panaderia/")),
});
