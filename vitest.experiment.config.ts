import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["perf/**/*.experiment.ts"],
    pool: "forks",
    fileParallelism: false,
    testTimeout: 6 * 60 * 60 * 1000,
    hookTimeout: 180_000,
  },
});
