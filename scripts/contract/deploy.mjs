// Deploys contracts/perde to NEAR testnet (TESTNET ONLY).
//
//   npm run deploy          -> if .env has NEAR_TESTNET_ACCOUNT_ID/NEAR_TESTNET_PRIVATE_KEY, redeploys
//                              the code to that account; otherwise creates a faucet-funded account first.
//   npm run deploy:fresh    -> always creates a new faucet-funded account (use when the state layout
//                              changed incompatibly); the previous credentials stay in .env as comments.
//
// The private key is written only to the root .env (gitignored). Nothing secret is printed.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Account, KeyPair } from 'near-api-js';
import {
  DEPLOYMENT_PATH,
  ENV_ACCOUNT,
  ENV_KEY,
  EXPLORER_ACCOUNT,
  EXPLORER_TX,
  FAUCET_URL,
  NETWORK,
  WASM_PATH,
  accountExists,
  fmtNear,
  makeProvider,
  readEnv,
  sleep,
  txHashOf,
  upsertEnv,
} from './lib/common.mjs';

const PREFERRED_ID = 'perde-pay.testnet';
const fresh = process.argv.includes('--fresh');
const provider = makeProvider();

async function createFaucetAccount() {
  const candidates = [PREFERRED_ID];
  for (let i = 0; i < 5; i++) candidates.push(`perde-pay-${randomBytes(3).toString('hex')}.testnet`);
  for (const accountId of candidates) {
    if (await accountExists(provider, accountId)) {
      console.log(`- ${accountId} is taken`);
      continue;
    }
    const keyPair = KeyPair.fromRandom('ed25519');
    const publicKey = keyPair.getPublicKey().toString();
    console.log(`- requesting ${accountId} from the testnet faucet helper`);
    const res = await fetch(FAUCET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
    });
    const body = await res.text();
    console.log(`  faucet HTTP ${res.status}: ${body.slice(0, 300)}`);
    if (!res.ok) continue;
    for (let i = 0; i < 30; i++) {
      if (await accountExists(provider, accountId)) {
        // Persist the credentials immediately so a later failure never loses the account.
        upsertEnv({ [ENV_ACCOUNT]: accountId, [ENV_KEY]: keyPair.toString() });
        console.log(`  account ${accountId} exists; credentials saved to .env`);
        return { accountId, keyPair };
      }
      await sleep(2000);
    }
    throw new Error(`faucet accepted ${accountId} but it did not appear on chain within 60 s`);
  }
  throw new Error('could not create a testnet account via the faucet');
}

async function main() {
  if (!existsSync(WASM_PATH)) {
    console.log('wasm not found, building first');
    const buildScript = join(dirname(fileURLToPath(import.meta.url)), 'build.mjs');
    const r = spawnSync(process.execPath, [buildScript], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  const code = readFileSync(WASM_PATH);
  const wasmSha256 = createHash('sha256').update(code).digest('hex');
  console.log(`wasm: ${WASM_PATH} (${code.length} bytes, sha256 ${wasmSha256})`);

  const env = readEnv();
  let accountId = env[ENV_ACCOUNT];
  let keyPair = env[ENV_KEY] ? KeyPair.fromString(env[ENV_KEY]) : undefined;
  if (fresh || !accountId || !keyPair) {
    ({ accountId, keyPair } = await createFaucetAccount());
  } else {
    console.log(`- reusing ${accountId} from .env`);
  }

  const account = new Account(accountId, provider, keyPair.toString());
  const before = await account.getState();
  console.log(`- balance before deploy: ${fmtNear(before.balance.total)} NEAR`);

  console.log('- sending DeployContract transaction');
  const result = await account.deployContract(new Uint8Array(code));
  const deployTx = txHashOf(result);
  console.log(`  deploy tx: ${EXPLORER_TX}${deployTx}`);

  const remote = await account.getContractCode();
  const remoteSha = createHash('sha256').update(Buffer.from(remote.code)).digest('hex');
  if (remoteSha !== wasmSha256) throw new Error(`on-chain code hash mismatch: ${remoteSha}`);

  const config = await provider.callFunction({ contractId: accountId, method: 'get_config', args: {} });
  console.log(`- get_config: ${JSON.stringify(config)}`);

  const deployment = {
    network: NETWORK,
    contractId: accountId,
    deployTx,
    deployedAt: new Date().toISOString(),
    wasmSha256,
  };
  mkdirSync(dirname(DEPLOYMENT_PATH), { recursive: true });
  writeFileSync(DEPLOYMENT_PATH, `${JSON.stringify(deployment, null, 2)}\n`, 'utf8');
  console.log(`- wrote ${DEPLOYMENT_PATH}`);
  console.log(JSON.stringify(deployment, null, 2));
  console.log(`account: ${EXPLORER_ACCOUNT}${accountId}`);
}

main().catch((e) => {
  console.error(`deploy failed: ${e?.message ?? e}`);
  process.exit(1);
});
