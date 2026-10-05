import { defineConfig, devices } from "@playwright/test";

/**
 * Item 5 — Testes ponta a ponta (E2E).
 *
 * Sobe um ambiente isolado só para os testes:
 *  - backend em :3101 apontando para um MongoDB em memória
 *    (npm run test:server no modeladb-backend, nunca o banco real);
 *  - frontend (Vite) em :5174 apontando para esse backend.
 * As portas são diferentes das de desenvolvimento (3001/5173) de propósito.
 */
const BACKEND_PORT = 3101;
const FRONTEND_PORT = 5174;

export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "reports/playwright" }]],
  outputDir: "test-results/playwright",
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chrome",
      grepInvert: /@perf/,
      // Usa o Google Chrome já instalado na máquina (sem baixar navegadores).
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } },
    },
    {
      // Medições de desempenho: rodam só com `npm run test:e2e:perf`.
      name: "perf",
      grep: /@perf/,
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: "npm run test:server",
      cwd: "../modeladb-backend",
      url: `${BACKEND_URL}/diagram/my-documents`,
      env: { PORT: String(BACKEND_PORT), FRONT_URL: `http://localhost:${FRONTEND_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
    },
    {
      command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
      url: `http://localhost:${FRONTEND_PORT}`,
      env: { VITE_BACKEND_URL: BACKEND_URL },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
