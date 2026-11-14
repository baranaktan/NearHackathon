// Shared helpers for the demo-DAO scripts (TESTNET ONLY).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCore, ROOT } from '../demo/ensure-core.mjs';

export { ROOT };
export const DEPLOYMENT_PATH = join(ROOT, 'deployments', 'testnet.json');
export const ENV_PATH = join(ROOT, '.env');
/** Cached faucet account used by packages/core/test/testnetFunder.ts (gitignored). */
export const TEST_FUNDER_CACHE = join(ROOT, 'packages', 'core', 'node_modules', '.cache', 'perde-testnet', 'funder.json');

/** Never leave a funding account below this (the contract account keeps its storage safe). */
export const SOURCE_FLOOR_NEAR = '3';

export const DEFAULTS = {
  name: 'perde-demo',
  purpose:
    'Open demo treasury for Perde private payments. Anyone may propose and approve FunctionCall proposals, so a visitor can watch a DAO pay a contributor without revealing who. Testnet demo only: real DAOs keep their own council policy.',
  proposalBondNear: '0.01',
  proposalPeriodNs: 3_600_000_000_000n, // 1 hour
  createDepositNear: '5.75', // the testnet default DAO code needs ~5.41 NEAR of storage; the rest stays as treasury
  targetAvailableNear: '3',
};

export const core = await loadCore();

export function readEnv() {
  const out = {};
  if (!existsSync(ENV_PATH)) return out;
  for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** The contract deployer account from the root .env (never printed). */
export function deployerAccount() {
  const env = { ...readEnv(), ...process.env };
  const accountId = env.NEAR_TESTNET_ACCOUNT_ID;
  const secretKey = env.NEAR_TESTNET_PRIVATE_KEY;
  if (!accountId || !secretKey) throw new Error('NEAR_TESTNET_ACCOUNT_ID / NEAR_TESTNET_PRIVATE_KEY missing from the root .env');
  return { accountId, signer: core.SeedSigner.fromSecretKey(secretKey), label: 'deployer (.env)' };
}

/** The cached test funder (created by `npm run test:testnet`), or null. */
export function testFunderAccount() {
  if (!existsSync(TEST_FUNDER_CACHE)) return null;
  const c = JSON.parse(readFileSync(TEST_FUNDER_CACHE, 'utf8'));
  return { accountId: c.accountId, signer: core.SeedSigner.fromSecretKey(c.secretKey), label: 'test funder (packages/core cache)' };
}

export function readDeployment() {
  return JSON.parse(readFileSync(DEPLOYMENT_PATH, 'utf8'));
}

/** Merges `dao` into deployments/testnet.json without touching other fields. */
export function writeDaoDeployment(patch) {
  const current = readDeployment();
  const next = { ...current, dao: { ...(current.dao ?? {}), ...patch } };
  writeFileSync(DEPLOYMENT_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next.dao;
}

export function makeRpc() {
  return new core.NearRpc({ urls: core.NETWORKS.testnet.rpcUrls });
}

export const near = (y) => `${core.formatNear(y, { maxDecimals: 4 })} NEAR`;
export const txLink = (h) => core.explorerTxUrl('testnet', h);
export const accountLink = (id) => core.explorerAccountUrl('testnet', id);

export function assertTestnet(accountId) {
  if (!accountId.endsWith('.testnet') && !/^[0-9a-f]{64}$/.test(accountId)) throw new Error(`refusing to use non-testnet account ${accountId}`);
}
