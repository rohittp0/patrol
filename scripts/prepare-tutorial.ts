import { spawnSync } from "node:child_process";
import { PLAYTEST_CONFIG } from "../src/game/playtest.config";

const result = spawnSync("python3", ["scripts/prepare_tutorial.py"], {
  input: JSON.stringify({ ...PLAYTEST_CONFIG.tutorial.animation, openingMaxOrders: PLAYTEST_CONFIG.levels[0].maxOrders }), encoding: "utf8",
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exitCode = result.status ?? 1;
