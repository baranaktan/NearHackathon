/**
 * LIVE testnet suite (`npm run test:e2e:testnet` from the repo root).
 * Real NEAR testnet transactions from a funded throwaway account (default:
 * packages/core/node_modules/.cache/perde-testnet/funder.json, or
 * PERDE_FUNDER_JSON). Never calls the faucet; 1Click quotes are dry. Serial.
 * With no funder available every test skips itself with that reason.
 */
import { defineConfig, devices } from '@playwright/test';
import { FUNDER_PATH, loadFunder } from './support/live';

const port = Number(process.env.PERDE_E2E_TESTNET_PORT ?? 4327);
const funder = loadFunder();
if (!funder) {
  console.warn(`\n[perde e2e:testnet] SKIPPED: no funded testnet account at ${FUNDER_PATH} (set PERDE_FUNDER_JSON to a {accountId, secretKey} file).\n`);
}

export default defineConfig({
  testDir: './tests/testnet',
  outputDir: './test-results/testnet',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: './playwright-report/testnet', open: 'never' }], ['json', { outputFile: './test-results/testnet-results.json' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'testnet-chromium', testMatch: /money-path\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'testnet-mobile', testMatch: /mobile\.spec\.ts/, use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node scripts/serve.mjs',
    env: { PERDE_E2E_PORT: String(port), PERDE_E2E_OUTDIR: '.app-dist-testnet' },
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
