/**
 * Records the read-only NEAR testnet RPC and 1Click answers the offline suite
 * replays (e2e/fixtures/recorded/). Needs network access, no secrets and no
 * funds: it drives the production build with the public test mnemonic and a
 * read-only "wallet" (the public contract account `perde-pay.testnet` with a
 * random key that can never sign for it), lets every request through to the
 * real endpoints and stores what came back, keyed by `rpcKey()`.
 *
 *   npm --prefix e2e run record-fixtures      # (re)writes e2e/fixtures/recorded/*.json
 *
 * Nothing is signed or broadcast; the faucet is never called.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { FAUCET_HOST, ONECLICK_HOST, RPC_HOST_RE, rpcKey } from '../support/rpc-key.mjs';

const e2eRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(e2eRoot, 'fixtures', 'recorded');
const core = await import(pathToFileURL(join(e2eRoot, '..', 'packages', 'core', 'dist', 'index.js')).href);

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const READONLY_WALLET = 'perde-pay.testnet';
const RPC = 'https://near-testnet.drpc.org';
const port = Number(process.env.PERDE_E2E_PORT ?? 4318);

/** key → {result} | {error} as the node answered. */
const rpc = {};
/** "GET /v0/tokens" → body. */
const oneclick = {};

async function call(method, params, url = RPC) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const body = await res.json();
  const { id: _id, jsonrpc: _j, ...rest } = body;
  const key = rpcKey(method, params);
  if (!rest.error || !rpc[key]) rpc[key] = rest;
  return rest;
}

const server = spawn(process.execPath, [join(e2eRoot, 'scripts', 'serve.mjs')], { env: { ...process.env, PERDE_E2E_PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  server.stdout.on('data', (d) => String(d).includes('ready on') && ok());
  server.once('exit', (c) => fail(new Error(`preview exited ${c}`)));
});
const base = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch();
try {
  const signer = core.SeedSigner.generate();
  const identityState = (withWallet) => ({
    v: 1,
    wallet: withWallet ? { accountId: READONLY_WALLET, secretKey: signer.secretKey, source: 'import', addedAtMs: 1 } : null,
    identity: { mnemonic: MNEMONIC, confirmed: true, createdAtMs: 1 },
    invoices: [{ index: 0, amountYocto: '500000000000000000000000', note: 'Recorded fixture invoice', createdAtMs: 1 }],
    nextInvoiceIndex: 1,
    sent: [],
    claims: {},
    scan: null,
    demo: { dismissed: false, chainViewSeen: false, quoteSeen: false, daoPaid: false },
  });

  async function session(state, visit) {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    if (state) await ctx.addInitScript((s) => localStorage.getItem('perde:state') || localStorage.setItem('perde:state', s), JSON.stringify(state));
    await ctx.route(
      (url) => RPC_HOST_RE.test(url.hostname) || url.hostname === ONECLICK_HOST || url.hostname === FAUCET_HOST,
      async (route) => {
        const req = route.request();
        const host = new URL(req.url()).hostname;
        if (host === FAUCET_HOST) return route.abort(); // never create accounts
        const res = await route.fetch();
        const text = await res.text();
        if (host === ONECLICK_HOST) {
          const u = new URL(req.url());
          oneclick[`${req.method()} ${u.pathname}`] = { status: res.status(), body: JSON.parse(text) };
        } else if (req.method() === 'POST') {
          const { method, params } = JSON.parse(req.postData() ?? '{}');
          if (method !== 'send_tx') {
            try {
              const { id: _id, jsonrpc: _j, ...rest } = JSON.parse(text);
              const key = rpcKey(method, params);
              if (!rpc[key] || (rpc[key].error && !rest.error)) rpc[key] = rest;
            } catch {
              /* non-JSON answer (rate limiter): not a fixture */
            }
          }
        }
        return route.fulfill({ response: res, body: text });
      },
    );
    const page = await ctx.newPage();
    await visit(page);
    await ctx.close();
  }
  const go = (page, hash) => page.goto(`${base}#${hash}`, { waitUntil: 'domcontentloaded' });

  // Identity + read-only wallet: every route that reads the chain.
  await session(identityState(true), async (page) => {
    for (const r of ['/app/start', '/app/receive', '/app/send', '/app/invoice', '/app/payroll', '/app/settings']) {
      await go(page, r);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);
    }
    await go(page, '/app/inbox');
    await page.getByText(/announcements checked/).waitFor({ timeout: 120_000 });
    await page.waitForTimeout(2000);
    await go(page, '/app/dao');
    await page.getByText(/proposals so far/).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(2000);
    await go(page, '/app/audit');
    await page.getByRole('button', { name: 'Use my viewing key' }).click();
    await page.getByRole('button', { name: 'Open read-only view' }).click();
    await page.getByText(/payments · received/).waitFor({ timeout: 120_000 });
    // Pay page of invoice #0 with a real dry 1Click quote.
    const invoice0 = core.deriveInvoice(core.toViewKeys(core.keysFromMnemonic(MNEMONIC)), 0).stealthAccountId;
    await go(page, `/pay?to=${invoice0}&amount=0.5&note=Recorded`);
    await page.getByRole('heading', { name: 'Pay 0.5 NEAR' }).waitFor();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Get quote' }).click();
    await page.getByText('Payer sends about').waitFor({ timeout: 45_000 });
    // Send to a name that has no meta-address registered.
    await go(page, '/app/send?to=perde-unregistered-e2e.testnet');
    await page.getByText(/hasn’t registered a Perde meta-address/).waitFor({ timeout: 30_000 });
  });

  // Direct reads the mock uses as templates.
  await call('query', { request_type: 'view_account', finality: 'optimistic', account_id: 'perde-e2e-missing-account.testnet' });
  const keys = await call('query', { request_type: 'view_access_key_list', finality: 'optimistic', account_id: READONLY_WALLET });
  const fullKey = keys.result.keys.find((k) => k.access_key.permission === 'FullAccess');
  await call('query', { request_type: 'view_access_key', finality: 'optimistic', account_id: READONLY_WALLET, public_key: fullKey.public_key });
  await call('block', { finality: 'final' });
  // dRPC answers gas_price with UNKNOWN_BLOCK about a third of the time; the app asks FastNEAR first too.
  await call('gas_price', [null], 'https://test.rpc.fastnear.com');
  await call('EXPERIMENTAL_protocol_config', { finality: 'final' });
  // A lookup of a transaction the chain never saw (template for "broadcast lost" tests).
  await call('tx', { tx_hash: '9Qg1J7dGLUUxN4uAsSsLtczSWUM1zW2DAoqPLQ29VZ2p', sender_account_id: READONLY_WALLET, wait_until: 'NONE' }, 'https://test.rpc.fastnear.com');
} finally {
  await browser.close();
  server.kill();
}

const recordedAt = new Date().toISOString();
await mkdir(outDir, { recursive: true });
// The protocol config is large; keep only what core's fee parser reads.
for (const [k, v] of Object.entries(rpc)) {
  if (k.startsWith('EXPERIMENTAL_protocol_config') && v.result) {
    const rc = v.result.runtime_config;
    v.result = {
      protocol_version: v.result.protocol_version,
      runtime_config: {
        min_gas_purchase_price: rc.min_gas_purchase_price,
        account_creation_charge: rc.account_creation_charge,
        transaction_costs: {
          action_receipt_creation_config: rc.transaction_costs.action_receipt_creation_config,
          pessimistic_gas_price_inflation_ratio: rc.transaction_costs.pessimistic_gas_price_inflation_ratio,
          action_creation_config: rc.transaction_costs.action_creation_config,
        },
      },
      _trimmed: 'fields core does not read were removed by record-fixtures.mjs',
    };
  }
}
// Blocks: core reads only the header hash/height (validator approvals are noise).
for (const [k, v] of Object.entries(rpc)) {
  if ((k === 'block' || k.startsWith('block ')) && v.result?.header) {
    const h = v.result.header;
    v.result = { header: { hash: h.hash, height: h.height, prev_hash: h.prev_hash, timestamp: h.timestamp }, _trimmed: 'only the header fields core reads are kept (record-fixtures.mjs)' };
  }
}
const sortedRpc = Object.fromEntries(Object.entries(rpc).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(
  join(outDir, 'testnet-rpc.json'),
  JSON.stringify({ _note: 'RECORDED FIXTURE: real NEAR testnet JSON-RPC answers captured by e2e/scripts/record-fixtures.mjs.', recordedAt, endpoint: 'testnet RPC (dRPC / FastNEAR)', readonlyWallet: READONLY_WALLET, responses: sortedRpc }, null, 1) + '\n',
);
await writeFile(
  join(outDir, 'oneclick.json'),
  JSON.stringify({ _note: 'RECORDED FIXTURE: real 1Click (NEAR Intents) answers, dry quotes only.', recordedAt, responses: oneclick }, null, 1) + '\n',
);
console.log(`recorded ${Object.keys(rpc).length} RPC answers and ${Object.keys(oneclick).length} 1Click answers into ${outDir}`);
