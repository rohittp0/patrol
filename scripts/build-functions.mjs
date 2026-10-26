import { build } from "esbuild";
await build({
  entryPoints: ["functions/src/index.ts"],
  outfile: "functions/lib/index.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["firebase-admin/*", "firebase-functions/*"],
  sourcemap: true,
});
