import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  // Every test shares one browser and its tabs, so they can't run in parallel.
  workers: 1,
  globalSetup: "./tests/globalSetup.ts",
});
