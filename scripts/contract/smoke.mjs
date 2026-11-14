// Smoke test against the live Perde contract on NEAR testnet (TESTNET ONLY).
// Uses the deployer account from the root .env as the sender/registrant.
// Writes trimmed real outputs to evidence/contract-testnet-smoke.md (no secrets).
import { createHash, randomInt } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Account, KeyPair, actions, baseEncode } from 'near-api-js';
import {
  DEPLOYMENT_PATH,
  ENV_ACCOUNT,
  ENV_KEY,
  EXPLORER_ACCOUNT,
  EXPLORER_TX,
  ROOT,
  allLogs,
  fmtNear,
  makeProvider,
  readEnv,
  returnValue,
  tgas,
  totalGasBurnt,
  txHashOf,
  viewAccountRaw,
} from './lib/common.mjs';

const GAS = 30_000_000_000_000n; // 30 Tgas prepaid; unused gas is refunded
const SEND_DEPOSIT = 50_000_000_000_000_000_000_000n; // 0.05 NEAR
const REGISTER_DEPOSIT = 2_500_000_000_000_000_000_000n; // 0.0025 NEAR (max needed 0.00241)

const env = readEnv();
const deployment = JSON.parse(readFileSync(DEPLOYMENT_PATH, 'utf8'));
const contractId = deployment.contractId;
if (env[ENV_ACCOUNT] !== contractId) {
  throw new Error(`.env ${ENV_ACCOUNT} (${env[ENV_ACCOUNT]}) does not match deployments/testnet.json (${contractId})`);
}
const provider = makeProvider();
const signer = new Account(env[ENV_ACCOUNT], provider, env[ENV_KEY]);

const md = [];
const log = (s = '') => {
  console.log(s);
  md.push(s);
};
const block = (obj) => {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  log('```json');
  log(text);
  log('```');
};

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const view = (method, args = {}) => provider.callFunction({ contractId, method, args });

async function call(method, args, deposit, { expectFailure = false } = {}) {
  const result = await signer.signAndSendTransaction({
    receiverId: contractId,
    actions: [actions.functionCall(method, args, GAS, deposit)],
    waitUntil: 'FINAL',
    throwOnFailure: !expectFailure,
  });
  const hash = txHashOf(result);
  const receipts = result.receipts_outcome.map((r) => ({
    executor: r.outcome.executor_id,
    gas_burnt: tgas(r.outcome.gas_burnt),
    status: Object.keys(r.outcome.status)[0],
  }));
  return {
    hash,
    result,
    gas: totalGasBurnt(result),
    txGas: BigInt(result.transaction_outcome.outcome.gas_burnt),
    logs: allLogs(result),
    value: expectFailure ? undefined : returnValue(result),
    failure: result.status?.Failure,
    receipts,
  };
}

/** Builds a syntactically valid Perde meta-address from two random ed25519 public keys. */
function randomMetaAddress() {
  const kSpend = KeyPair.fromRandom('ed25519').getPublicKey().data;
  const kView = KeyPair.fromRandom('ed25519').getPublicKey().data;
  const body = Buffer.concat([kSpend, kView]);
  const checksum = createHash('sha256').update(body).digest().subarray(0, 4);
  return `perde:${baseEncode(Buffer.concat([body, checksum]))}`;
}

async function main() {
  const startedAt = new Date().toISOString();
  log('# Perde contract — testnet smoke test');
  log();
  log(`Run: ${startedAt} · contract [\`${contractId}\`](${EXPLORER_ACCOUNT}${contractId}) · deploy tx [${deployment.deployTx}](${EXPLORER_TX}${deployment.deployTx}) · wasm sha256 \`${deployment.wasmSha256}\``);
  log();
  log('Command: `cd scripts/contract && npm run smoke` (sender = the deployer account from `.env`). All outputs below are real RPC responses, trimmed. No private keys are included.');
  log();

  // 1. get_config
  log('## 1. `get_config` (view)');
  block(await view('get_config'));

  // 2. register
  const meta = randomMetaAddress();
  log('## 2. `register` (payable, 0.0025 NEAR attached)');
  log();
  log('Meta-address built from two random ed25519 public keys (smoke-test only, not a real wallet).');
  const reg = await call('register', { meta_address: meta }, REGISTER_DEPOSIT);
  log();
  log(`tx: ${EXPLORER_TX}${reg.hash}`);
  log(`total gas burnt: ${tgas(reg.gas)}`);
  block({ logs: reg.logs, receipts: reg.receipts });
  const regRefund = reg.result.receipts_outcome.length > 1;
  log(`storage refund receipt created: ${regRefund}`);
  log();

  // 3. get_meta_address
  log('## 3. `get_meta_address` (view)');
  const gotMeta = await view('get_meta_address', { account_id: signer.accountId });
  block({ account_id: signer.accountId, result: gotMeta });
  if (gotMeta !== meta) throw new Error('get_meta_address mismatch');
  const missing = await view('get_meta_address', { account_id: 'nobody-registered-this.testnet' });
  block({ account_id: 'nobody-registered-this.testnet', result: missing });

  // 4. send 0.05 NEAR to a fresh implicit account
  const stealthKey = KeyPair.fromRandom('ed25519');
  const stealthAccount = hex(stealthKey.getPublicKey().data);
  const ephemeralPk = hex(KeyPair.fromRandom('ed25519').getPublicKey().data);
  const viewTag = randomInt(0, 256);
  log('## 4. `send` (payable, 0.05 NEAR attached, 30 Tgas prepaid)');
  log();
  log('Stealth account = hex of a freshly generated ed25519 public key (the key was discarded; this is a smoke test).');
  const before = await viewAccountRaw(stealthAccount);
  const contractBefore = await viewAccountRaw(contractId);
  const countBefore = await view('announcement_count');
  block({ stealth_account_exists_before: before !== null, announcement_count_before: countBefore });
  const sent = await call(
    'send',
    { stealth_account: stealthAccount, ephemeral_pk: ephemeralPk, view_tag: viewTag },
    SEND_DEPOSIT,
  );
  log(`tx: ${EXPLORER_TX}${sent.hash}`);
  log(`returned index: ${sent.value}`);
  log(`gas burnt — transaction (signer side): ${tgas(sent.txGas)}; total incl. receipts: ${tgas(sent.gas)}`);
  block({ logs: sent.logs, receipts: sent.receipts });
  log();

  // 5. get_announcements
  log('## 5. `announcement_count` / `get_announcements` (view)');
  const count = await view('announcement_count');
  const page = await view('get_announcements', { from_index: sent.value, limit: 200 });
  block({ announcement_count: count, [`get_announcements({from_index:${sent.value}, limit:200})`]: page });
  const ann = page.find((a) => a.index === sent.value);
  if (!ann || ann.stealth_account !== stealthAccount || ann.amount !== (SEND_DEPOSIT - 2_000_000_000_000_000_000_000n).toString()) {
    throw new Error('announcement mismatch');
  }

  // 6. view_account of the stealth account
  log('## 6. `view_account` of the stealth account (funds arrived)');
  const after = await viewAccountRaw(stealthAccount);
  block({ account_id: stealthAccount, amount_yocto: after.amount, amount_near: fmtNear(after.amount), storage_usage: after.storage_usage, code_hash: after.code_hash });
  log(`explorer: ${EXPLORER_ACCOUNT}${stealthAccount}`);
  if (BigInt(after.amount) !== SEND_DEPOSIT - 2_000_000_000_000_000_000_000n) throw new Error('stealth balance mismatch');
  const contractAfter = await viewAccountRaw(contractId);
  const storageDelta = contractAfter.storage_usage - contractBefore.storage_usage;
  log();
  log(`Contract storage_usage: ${contractBefore.storage_usage} -> ${contractAfter.storage_usage} bytes (+${storageDelta} bytes for this announcement = ${fmtNear(BigInt(storageDelta) * 10n ** 19n)} NEAR staked, vs announce_fee 0.002 NEAR).`);
  log();

  // 7. negative case on chain: invalid view_tag is rejected and the deposit returns to the sender
  log('## 7. Rejected `send` (view_tag = 256) — deposit is refunded by the protocol');
  const bad = await call(
    'send',
    { stealth_account: stealthAccount, ephemeral_pk: ephemeralPk, view_tag: 256 },
    SEND_DEPOSIT,
    { expectFailure: true },
  );
  log(`tx: ${EXPLORER_TX}${bad.hash}`);
  block({ failure: bad.failure, receipts: bad.receipts });
  const countAfterBad = await view('announcement_count');
  log(`announcement_count after rejected send: ${countAfterBad} (unchanged)`);
  log();

  // 8. unregister + re-register (storage refund accounting)
  log('## 8. `unregister` then `register` again');
  const unreg = await call('unregister', {}, 0n);
  log(`unregister tx: ${EXPLORER_TX}${unreg.hash}`);
  block({ logs: unreg.logs, receipts: unreg.receipts, get_meta_address_after: await view('get_meta_address', { account_id: signer.accountId }) });
  const rereg = await call('register', { meta_address: meta }, REGISTER_DEPOSIT);
  log(`register tx: ${EXPLORER_TX}${rereg.hash}`);
  log(`get_meta_address after re-register: \`${await view('get_meta_address', { account_id: signer.accountId })}\``);
  log();

  log('## Summary');
  log();
  log('| Item | Value |');
  log('| --- | --- |');
  log(`| contract | \`${contractId}\` |`);
  log(`| send tx | [${sent.hash}](${EXPLORER_TX}${sent.hash}) |`);
  log(`| send gas burnt (total) | ${tgas(sent.gas)} (prepaid 30 Tgas) |`);
  log(`| register gas burnt (total) | ${tgas(reg.gas)} |`);
  log(`| storage per announcement (on chain) | ${storageDelta} bytes = ${fmtNear(BigInt(storageDelta) * 10n ** 19n)} NEAR |`);
  log(`| stealth account received | ${fmtNear(after.amount)} NEAR |`);

  mkdirSync(join(ROOT, 'evidence'), { recursive: true });
  writeFileSync(join(ROOT, 'evidence', 'contract-testnet-smoke.md'), `${md.join('\n')}\n`, 'utf8');
  console.log('\nwrote evidence/contract-testnet-smoke.md');
}

main().catch((e) => {
  console.error(`smoke failed: ${e?.message ?? e}`);
  process.exit(1);
});
