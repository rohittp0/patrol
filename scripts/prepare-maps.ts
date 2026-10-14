import { spawnSync } from "node:child_process";
import { PLAYTEST_CONFIG } from "../src/game/playtest.config";

// Source downloads are pinned and hashed in scripts/.cache/source-metadata.json.
// uv isolates the offline compiler's dependency; the browser and Pages build
// need only the generated JSON files, not Python or Shapely.
const result = spawnSync("uv", ["run", "--with", "shapely==2.2.0", "python", "scripts/prepare_maps.py"], {
  input: JSON.stringify(PLAYTEST_CONFIG),
  encoding: "utf8",
  stdio: ["pipe", "inherit", "inherit"],
  env: { ...process.env, UV_CACHE_DIR: process.env.UV_CACHE_DIR ?? "/private/tmp/patrol-uv-cache" },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
