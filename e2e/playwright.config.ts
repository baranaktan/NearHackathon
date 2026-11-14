/**
 * Offline-safe UI suite (`npm run test:e2e` from the repo root).
 * Builds apps/web into e2e/.app-dist and serves it with `vite preview`; every
 * chain / 1Click / faucet request is answered from recorded fixtures
 * (support/chain-mock.ts), so it passes without secrets, funds or network.
 *
 *   PERDE_E2E_PORT=4317   preview port
 *   PERDE_E2E_NO_BUILD=1  reuse an existing e2e/.app-dist
 */
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PERDE_E2E_PORT ?? 4317);

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/testnet/**'],
  outputDir: './test-results/offline',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.PERDE_E2E_WORKERS ? Number(process.env.PERDE_E2E_WORKERS) : 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: './playwright-report/offline', open: 'never' }], ['json', { outputFile: './test-results/offline-results.json' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // axe results do not depend on the engine: the @axe scans run on desktop Chromium and the Pixel viewport.
    { name: 'firefox', grepInvert: /@axe/, use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit', grepInvert: /@axe/, use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-pixel', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-iphone', grepInvert: /@axe/, use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'node scripts/serve.mjs',
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
