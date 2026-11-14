#!/usr/bin/env node
// Perde — one-command terminal demo on NEAR TESTNET. No secrets, no wallet.
//
//   npm run demo:testnet                       narrated run
//   npm run -s demo:testnet -- --json > r.json machine-readable result on stdout (narration on stderr)
//
// Account: DEMO_ACCOUNT_ID + DEMO_PRIVATE_KEY env vars if set; otherwise a cached
// faucet account in .cache/demo-account.json (gitignored) while it holds >= 2 NEAR;
// otherwise a fresh account from the public testnet faucet (10 NEAR, rate-limited per IP).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCore, ROOT } from './ensure-core.mjs';

const JSON_MODE = process.argv.includes('--json');
const out = JSON_MODE ? process.stderr : process.stdout;
const color = !JSON_MODE && process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint('1');
const dim = paint('2');
const green = paint('32');
const red = paint('31');
const yellow = paint('33');
const cyan = paint('36');
const say = (line = '') => out.write(`${line}\n`);

const t0 = Date.now();
const core = await loadCore();
const {
  createFaucetAccount,
  decodeReceipt,
  deriveInvoice,
  describeProposal,
  encodeMetaAddress,
  encodeViewingKey,
  explorerAccountUrl,
  explorerTxUrl,
  formatNear,
  generateMnemonic,
  isPerdeError,
  keysFromMnemonic,
  NETWORKS,
  OneClickClient,
  parseNear,
  PerdeClient,
  quoteToStealth,
  RECEIPT_PREFIX,
  SeedSigner,
  sendActions,
  SputnikDao,
  transfer,
} = core;

const NETWORK = 'testnet';
const CACHE_DIR = join(ROOT, '.cache');
const CACHE_FILE = join(CACHE_DIR, 'demo-account.json');
const MIN_CACHED = parseNear('2');
const MIN_ENV = parseNear('0.5');
const SEND_AMOUNT = parseNear('0.1');
const INVOICE_AMOUNT = parseNear('0.05');
const DAO_AMOUNT = parseNear('0.02');
const USDC_ARB = 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near';
const REFUND_EXAMPLE = '0x2527D02599Ba641c19FEa793cD0F167589a0f10D'; // 1Click OpenAPI example; dry quotes move no funds

const deployment = JSON.parse(readFileSync(join(ROOT, 'deployments', 'testnet.json'), 'utf8'));
if (deployment.network !== 'testnet') throw new Error('this demo only runs on testnet');
const rpcUrls = NETWORKS.testnet.rpcUrls;
const perde = new PerdeClient({ network: NETWORK, contractId: deployment.contractId, rpcUrls });
const rpc = perde.rpc;

const near = (y) => `${formatNear(y, { maxDecimals: 5 })} NEAR`;
const txUrl = (h) => explorerTxUrl(NETWORK, h);
const accUrl = (id) => explorerAccountUrl(NETWORK, id);
const short = (s, n = 10) => (s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);
// Every read that follows a write goes through bounded polling: RPC endpoints are load-balanced and a
// node may not have applied the block with our transaction yet (views then panic or return old state).
const READ_TIMEOUT_MS = 30_000;
const waitFor = (fn, ok, what) => core.pollUntil(fn, ok, { timeoutMs: READ_TIMEOUT_MS, what });
const waitForPayment = (viewingKey, fromIndex, stealthAccountId, amount) =>
  waitFor(
    () => perde.scan(viewingKey, { fromIndex }),
    (s) => s.payments.some((p) => p.stealthAccountId === stealthAccountId && p.balance === amount),
    `the payment to ${stealthAccountId} to be visible to the recipient's scan`,
  );
/**
 * Claim (DeleteAccount) once the stealth account and its key are visible. `claim` only reads before it
 * broadcasts; a read that hits a lagging node ("does not exist", unknown access key) is retried, while
 * a broadcast transaction failure (TX_FAILED) is never retried.
 */
async function claimWhenVisible(payment, stealthAccountId, destination) {
  await waitFor(() => rpc.viewAccountOrNull(stealthAccountId), (v) => v !== null && v.amount > 0n, `stealth account ${stealthAccountId}`);
  const lagging = (e) =>
    (e instanceof core.RpcError && (e.causeName === 'UNKNOWN_ACCESS_KEY' || e.causeName === 'UNKNOWN_ACCOUNT')) ||
    (isPerdeError(e, 'INSUFFICIENT_BALANCE') && /does not exist/.test(e.message));
  return core.pollUntil(() => perde.claim(bob, payment, destination, { mode: 'deleteAccount' }), () => true, { timeoutMs: READ_TIMEOUT_MS, retryOn: lagging, what: `claim of ${stealthAccountId}` });
}

const steps = [];
const result = {
  network: NETWORK,
  contractId: deployment.contractId,
  startedAt: new Date(t0).toISOString(),
  account: null,
  steps,
  ok: false,
  totalMs: 0,
};

/** Runs one narrated step; records pass/fail/skip, duration and tx links. */
async function step(id, title, mandatory, fn) {
  const record = { id, title, mandatory, status: 'pass', ms: 0, txs: [], data: {} };
  steps.push(record);
  say('');
  say(bold(cyan(`━━ ${id}. ${title}`)));
  const started = Date.now();
  const ctx = {
    tx(label, hash) {
      record.txs.push({ label, hash, url: txUrl(hash) });
      say(`   ${dim('tx')} ${label}: ${txUrl(hash)}`);
    },
    line(s) {
      say(`   ${s}`);
    },
    data: record.data,
    skip(reason) {
      const e = new Error(reason);
      e.skip = true;
      throw e;
    },
  };
  try {
    await fn(ctx);
  } catch (e) {
    if (e?.skip) {
      record.status = 'skip';
      record.reason = e.message;
      say(`   ${yellow('SKIPPED')} ${e.message}`);
    } else {
      record.status = 'fail';
      record.reason = e instanceof Error ? e.message : String(e);
      say(`   ${red('FAILED')} ${record.reason}`);
    }
  }
  record.ms = Date.now() - started;
  if (record.status === 'pass') say(`   ${green('✓')} ${dim(`${(record.ms / 1000).toFixed(1)} s`)}`);
  return record.status === 'pass';
}

function exitWith(code) {
  result.totalMs = Date.now() - t0;
  if (JSON_MODE) process.stdout.write(`${JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n`);
  process.exit(code);
}

// ───────────────────────────── account ─────────────────────────────
async function getDemoAccount() {
  const envId = process.env.DEMO_ACCOUNT_ID;
  const envKey = process.env.DEMO_PRIVATE_KEY;
  if (envId || envKey) {
    if (!envId || !envKey) throw new Error('set both DEMO_ACCOUNT_ID and DEMO_PRIVATE_KEY (or neither)');
    if (!envId.endsWith('.testnet') && !/^[0-9a-f]{64}$/.test(envId)) throw new Error('DEMO_ACCOUNT_ID must be a testnet account');
    const balance = await rpc.getBalance(envId);
    if (balance < MIN_ENV) throw new Error(`${envId} holds ${near(balance)}; the demo needs at least ${near(MIN_ENV)}`);
    return { accountId: envId, signer: SeedSigner.fromSecretKey(envKey), source: 'env (DEMO_ACCOUNT_ID)', balance };
  }
  if (existsSync(CACHE_FILE)) {
    try {
      const cached = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
      const balance = await rpc.getBalance(cached.accountId);
      if (balance >= MIN_CACHED) return { accountId: cached.accountId, signer: SeedSigner.fromSecretKey(cached.secretKey), source: 'cache (.cache/demo-account.json)', balance };
      say(`   cached account ${cached.accountId} holds ${near(balance)} (< ${near(MIN_CACHED)}); requesting a new one`);
    } catch {
      say('   ignoring an unreadable .cache/demo-account.json');
    }
  }
  // Save the key BEFORE asking the faucet so a created account is never lost.
  const signer = SeedSigner.generate();
  const accountId = core.randomTestnetAccountId('perde-demo');
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify({ accountId, secretKey: signer.secretKey, createdAt: new Date().toISOString(), network: NETWORK }));
  say(`   asking the testnet faucet for ${accountId} …`);
  const acc = await createFaucetAccount({ accountId, signer, rpcUrls });
  const remaining = acc.rateLimit?.remaining;
  return { accountId, signer, source: `testnet faucet${remaining === undefined ? '' : ` (${remaining} creations left in this IP's window)`}`, balance: acc.balance ?? (await rpc.getBalance(accountId)), faucetTx: acc.txHash };
}

say(bold('Perde — private payments on NEAR (testnet demo)'));
say(dim(`contract ${deployment.contractId} · ${accUrl(deployment.contractId)}`));

let account;
const accountOk = await step(0, 'Get a funded testnet account (no wallet, no secrets)', true, async (s) => {
  try {
    account = await getDemoAccount();
  } catch (e) {
    if (isPerdeError(e, 'FAUCET_ERROR')) {
      const reset = e.details?.rateLimit?.resetAt;
      say('');
      say(red('   The public testnet faucet refused to create an account:'));
      say(`   ${e.message}${reset ? ` (≈ ${new Date(reset * 1000).toISOString()})` : ''}`);
      say('   Use any funded testnet account instead (≥ 0.5 NEAR; the demo recycles almost everything):');
      say('     PowerShell:  $env:DEMO_ACCOUNT_ID="you.testnet"; $env:DEMO_PRIVATE_KEY="ed25519:…"; npm run demo:testnet');
      say('     bash:        DEMO_ACCOUNT_ID=you.testnet DEMO_PRIVATE_KEY=ed25519:… npm run demo:testnet');
      say('   The key is only used in this process to sign testnet transactions; it is never written to disk or logged.');
    }
    throw e;
  }
  result.account = { accountId: account.accountId, source: account.source, startBalance: account.balance };
  s.line(`account ${bold(account.accountId)} — ${account.source}`);
  s.line(`balance ${near(account.balance)} · ${accUrl(account.accountId)}`);
  if (account.faucetTx) s.tx('faucet account creation', account.faucetTx);
});
if (!accountOk) exitWith(2);
const alice = account;

// ───────────────────────────── 1. Bob's keys ─────────────────────────────
const bob = keysFromMnemonic(generateMnemonic());
const bobMeta = encodeMetaAddress(bob);
const bobViewingKey = encodeViewingKey(bob);
await step(1, 'Bob creates keys and a meta-address', true, async (s) => {
  s.line('Bob generates a 12-word recovery phrase (kept in memory only; not printed).');
  s.line(`meta-address (public, shareable): ${bold(short(bobMeta, 18))}`);
  s.line(`viewing key (read-only, for Bob or his auditor): ${short(bobViewingKey, 14)}`);
  s.line(dim('Bob posts the meta-address once. Every payment to it lands in a different, fresh account.'));
  s.data.metaAddress = bobMeta;
});

// ───────────────────────────── 2. Alice sends ─────────────────────────────
let sent;
await step(2, `Alice sends ${near(SEND_AMOUNT)} privately through the Perde contract`, true, async (s) => {
  const config = await perde.getConfig();
  sent = await perde.send(alice.signer, alice.accountId, bobMeta, SEND_AMOUNT);
  s.tx(`${alice.accountId} → ${deployment.contractId}.send (deposit ${near(SEND_AMOUNT + config.announceFee)} incl. ${near(config.announceFee)} fee)`, sent.txHash);
  s.line(`one-time stealth account: ${sent.stealthAccountId}`);
  s.line(`announcement #${sent.announcementIndex}; Alice keeps a private payment receipt`);
  Object.assign(s.data, { stealthAccountId: sent.stealthAccountId, announcementIndex: sent.announcementIndex, txHash: sent.txHash });
});

// ───────────────────────────── 3. public vs Bob ─────────────────────────────
let found;
await step(3, 'What the chain shows vs. what Bob sees', true, async (s) => {
  if (!sent) s.skip('needs step 2');
  const page = await waitFor(
    () => perde.fetchAnnouncements({ fromIndex: sent.announcementIndex, limit: 1 }),
    (p) => p.announcements[0]?.stealthAccountId === sent.stealthAccountId,
    `announcement #${sent.announcementIndex}`,
  );
  const ann = page.announcements[0];
  const view = await waitFor(() => rpc.viewAccountOrNull(sent.stealthAccountId), (v) => v !== null && v.amount > 0n, `stealth account ${sent.stealthAccountId}`);
  s.line(bold('Public observer:'));
  s.line(`  announcement row: {index: ${ann.index}, stealth_account: ${short(ann.stealthAccountId)}, ephemeral_pk: ${short(ann.ephemeralPk)}, view_tag: ${ann.viewTag}, amount: ${near(ann.amount)}}`);
  s.line(`  ${short(sent.stealthAccountId)} is a brand-new implicit account with ${near(view.amount)} and no history: ${accUrl(sent.stealthAccountId)}`);
  s.line('  Nothing in the row or the account mentions Bob or his meta-address.');
  const eve = keysFromMnemonic(generateMnemonic());
  const scan = await waitForPayment(bobViewingKey, sent.announcementIndex, sent.stealthAccountId, SEND_AMOUNT);
  const eveScan = await perde.scan(encodeViewingKey(eve), { fromIndex: sent.announcementIndex });
  found = scan.payments.find((p) => p.stealthAccountId === sent.stealthAccountId);
  s.line(bold('Bob (viewing key):'));
  s.line(`  scanned ${scan.scanned} announcement(s): found ${scan.payments.length} payment(s) for him → ${found ? `${short(found.stealthAccountId)} holding ${near(found.balance)}` : 'none'}`);
  s.line(`  Eve scanning the same announcements with her own key finds ${eveScan.payments.length}.`);
  if (!found || found.balance !== SEND_AMOUNT) throw new Error('Bob did not find the payment with the expected balance');
  if (eveScan.payments.length !== 0) throw new Error('another key matched the payment');
  Object.assign(s.data, { publicRow: { index: ann.index, viewTag: ann.viewTag, amount: ann.amount }, bobFound: scan.payments.length, eveFound: eveScan.payments.length });
});

// ───────────────────────────── 4. claim ─────────────────────────────
await step(4, 'Bob claims the payment to a destination', true, async (s) => {
  if (!found) s.skip('needs step 3');
  const destination = alice.accountId;
  s.line(dim(`Destination: ${destination} (in this demo the funded account, so testnet NEAR is recycled; Bob would use his own account).`));
  const claim = await claimWhenVisible(found, found.stealthAccountId, destination);
  s.tx(`stealth account → ${destination} (DeleteAccount, signed with the derived stealth key)`, claim.txHash);
  s.line(`moved ${near(claim.balanceBefore)} minus ${near(claim.tokensBurnt)} gas; the stealth account is deleted, no dust left`);
  Object.assign(s.data, { txHash: claim.txHash, moved: claim.balanceBefore, burnt: claim.tokensBurnt });
});

// ───────────────────────────── 5. invoice ─────────────────────────────
let invoice;
await step(5, `Invoice mode: one-time address, paid with a plain transfer of ${near(INVOICE_AMOUNT)}`, true, async (s) => {
  invoice = deriveInvoice(bob, 0);
  s.line(`invoice #0 address (derived from Bob's keys, no contract, no announcement): ${invoice.stealthAccountId}`);
  const pay = await sendActions({ rpc, signer: alice.signer, signerId: alice.accountId, receiverId: invoice.stealthAccountId, actions: [transfer(INVOICE_AMOUNT)] });
  s.tx(`${alice.accountId} → invoice address (ordinary NEAR Transfer — any wallet or exchange can pay it)`, pay.hash);
  const invoices = await waitFor(
    () => perde.scanInvoices(bobViewingKey, { gapLimit: 3 }),
    (list) => list.some((i) => i.index === 0 && i.balance === INVOICE_AMOUNT),
    'invoice #0 to show the payment',
  );
  const hit = invoices.find((i) => i.index === 0);
  s.line(`Bob's scanInvoices(viewing key) found invoice #0 with ${near(hit.balance)}`);
  const claim = await claimWhenVisible({ invoiceIndex: 0 }, invoice.stealthAccountId, alice.accountId);
  s.tx('Bob sweeps invoice #0 (DeleteAccount)', claim.txHash);
  Object.assign(s.data, { invoiceAccount: invoice.stealthAccountId, payTx: pay.hash, claimTx: claim.txHash });
});

// ───────────────────────────── 6. 1Click dry quote ─────────────────────────────
await step(6, 'Preview: "pay this invoice with USDC from Arbitrum" (NEAR Intents 1Click, DRY RUN)', false, async (s) => {
  s.line(yellow('DRY-RUN PREVIEW — mainnet pricing from the real 1Click API; no deposit address, nothing executed.'));
  const target = deriveInvoice(bob, 1).stealthAccountId;
  let res;
  try {
    res = await quoteToStealth(new OneClickClient(), { originAsset: USDC_ARB, amountOutYocto: parseNear('1'), stealthAccountId: target, refundTo: REFUND_EXAMPLE, dry: true });
  } catch (e) {
    s.skip(`1Click API unavailable (${e instanceof Error ? e.message : String(e)}); this step is optional`);
  }
  const q = res.quote;
  s.line(`to deliver exactly 1 NEAR to Bob's invoice #1 (${short(target)}): pay ≈ ${q.amountInFormatted} USDC on Arbitrum (≈ $${Number(q.amountInUsd).toFixed(2)}), ~${q.timeEstimate} s`);
  Object.assign(s.data, { dry: true, amountIn: q.amountInFormatted, amountInUsd: q.amountInUsd, amountOut: q.amountOutFormatted, timeEstimate: q.timeEstimate, correlationId: res.correlationId });
});

// ───────────────────────────── 7. receipts ─────────────────────────────
await step(7, "Receipt: Alice proves she paid Bob's meta-address", true, async (s) => {
  if (!sent) s.skip('needs step 2');
  const v = await waitFor(() => perde.verifyReceipt(sent.receipt), (r) => r.announced || !r.valid, 'the receipt to match its announcement');
  s.line(`receipt ${short(sent.receipt, 16)} → valid ${v.valid}, matches on-chain announcement #${v.announcement?.index}: ${v.announced}`);
  const data = decodeReceipt(sent.receipt);
  const other = keysFromMnemonic(generateMnemonic());
  const forged = RECEIPT_PREFIX + Buffer.from(JSON.stringify({ ...data, meta: encodeMetaAddress(other) })).toString('base64url');
  const f = await perde.verifyReceipt(forged);
  s.line(`same receipt claiming a different meta-address → valid ${f.valid}`);
  if (!(v.valid && v.announced) || f.valid) throw new Error('receipt verification did not behave as expected');
  s.line(dim('A receipt links one stealth account to the meta-address; it grants no spending power.'));
  Object.assign(s.data, { valid: v.valid, announced: v.announced, forgedValid: f.valid });
});

// ───────────────────────────── 8. DAO ─────────────────────────────
const daoInfo = deployment.dao;
await step(8, 'A DAO treasury pays a contributor privately (SputnikDAO proposal → perde.send)', Boolean(daoInfo), async (s) => {
  if (!daoInfo) s.skip('no demo DAO recorded in deployments/testnet.json (run npm run dao:setup)');
  const dao = new SputnikDao({ network: NETWORK, daoId: daoInfo.daoId, perdeContractId: deployment.contractId, rpcUrls });
  const [config, bal] = await Promise.all([perde.getConfig(), dao.getBalance()]);
  s.line(`DAO ${daoInfo.daoId} (open demo policy), treasury available ${near(bal.available)} · ${accUrl(daoInfo.daoId)}`);
  if (bal.available < DAO_AMOUNT + config.announceFee + parseNear('0.02')) s.skip('demo DAO treasury is empty (run npm run dao:fund)');
  const startIndex = await perde.announcementCount();
  const proposal = await dao.proposeStealthPayment(alice.signer, alice.accountId, { recipient: bobMeta, amountYocto: DAO_AMOUNT, description: 'Contributor payout (demo)' });
  s.tx(`add_proposal #${proposal.proposalId}: FunctionCall ${deployment.contractId}.send, bond ${near(proposal.bondYocto)}`, proposal.txHash);
  const d = describeProposal(await dao.waitForProposal(proposal.proposalId), { contractId: deployment.contractId, announceFee: config.announceFee });
  s.line(`public proposal text: "Contributor payout (demo)"; decoded: pays ${d.type === 'perde-payment' ? `${near(d.totalAmountYocto)} to ${short(d.payments[0].stealthAccountId)}` : '?'} — no recipient name anywhere`);
  const vote = await dao.vote(alice.signer, alice.accountId, proposal.proposalId, 'approve');
  s.tx(`act_proposal VoteApprove → status ${vote.status}; the DAO calls perde.send in the same transaction`, vote.txHash);
  if (!vote.executed) throw new Error(`proposal not executed (status ${vote.status ?? 'not readable'}; failed receipts ${JSON.stringify(vote.failedReceipts)})`);
  const scan = await waitForPayment(bobViewingKey, startIndex, proposal.stealthAccountId, DAO_AMOUNT);
  const pay = scan.payments.find((p) => p.stealthAccountId === proposal.stealthAccountId);
  s.line(`Bob's scan finds the DAO payment: ${near(pay.balance)} at ${short(pay.stealthAccountId)}`);
  const claim = await claimWhenVisible(pay, pay.stealthAccountId, alice.accountId);
  s.tx('Bob claims the DAO payment', claim.txHash);
  Object.assign(s.data, { daoId: daoInfo.daoId, proposalId: proposal.proposalId, stealthAccountId: proposal.stealthAccountId });
});

// ───────────────────────────── summary ─────────────────────────────
result.totalMs = Date.now() - t0;
const endBalance = await rpc.getBalance(alice.accountId).catch(() => undefined);
if (result.account) result.account.endBalance = endBalance;
// A required step that was skipped only because an earlier step failed is already counted by that failure;
// the DAO step skips (without failing the run) when the shared demo treasury is empty.
const mandatoryFailed = steps.filter((x) => x.mandatory && x.status === 'fail');
result.ok = mandatoryFailed.length === 0;

say('');
say(bold('Summary'));
const rows = steps.map((x) => [String(x.id), x.title.length > 62 ? `${x.title.slice(0, 61)}…` : x.title, x.status, x.mandatory ? 'yes' : 'no', `${(x.ms / 1000).toFixed(1)} s`, x.txs.length ? short(x.txs[0].hash, 6) : '']);
const header = ['#', 'step', 'result', 'required', 'time', 'first tx'];
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const fmt = (r) => r.map((c, i) => c.padEnd(widths[i])).join('  ');
say(dim(fmt(header)));
for (const r of rows) {
  const st = r[2] === 'pass' ? green : r[2] === 'skip' ? yellow : red;
  say(fmt(r).replace(r[2].padEnd(widths[2]), st(r[2].padEnd(widths[2]))));
}
say('');
say(`account ${alice.accountId}: ${near(alice.balance)} → ${endBalance === undefined ? '?' : near(endBalance)} (cost of the whole demo ≈ ${endBalance === undefined ? '?' : near(alice.balance - endBalance)})`);
say(`total runtime ${(result.totalMs / 1000).toFixed(1)} s — ${result.ok ? green('all required steps passed') : red(`${mandatoryFailed.length} required step(s) failed`)}`);
exitWith(result.ok ? 0 : 1);
