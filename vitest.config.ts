import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    benchmark: { include: ["src/**/*.bench.ts"] },
    coverage: {
      provider: "v8",
      include: ["src/stores/**", "src/utils/**", "src/services/**"],
      exclude: ["src/test/**", "src/**/*.bench.ts", "src/**/*.test.ts"],
      reporter: ["text", "html", "json-summary"],
    },
  },
});
