import { defineConfig } from "vite";
import { PLAYTEST_CONFIG } from "./src/game/playtest.config.ts";

export default defineConfig({
  base: PLAYTEST_CONFIG.hosting.basePath,
  server: {
    port: PLAYTEST_CONFIG.hosting.devServerPort,
    strictPort: true,
  },
  preview: {
    port: PLAYTEST_CONFIG.hosting.devServerPort,
    strictPort: true,
  },
});
