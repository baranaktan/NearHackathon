// Shared helpers for the Perde contract scripts (testnet only).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FailoverRpcProvider, JsonRpcProvider } from 'near-api-js';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..', '..');
export const CONTRACT_DIR = join(ROOT, 'contracts', 'perde');
export const WASM_PATH = join(CONTRACT_DIR, 'target', 'near', 'perde.wasm');
export const ENV_PATH = join(ROOT, '.env');
export const DEPLOYMENT_PATH = join(ROOT, 'deployments', 'testnet.json');

export const NETWORK = 'testnet';
export const RPC_URLS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'];
export const FAUCET_URL = 'https://helper.nearprotocol.com/account';
export const EXPLORER_TX = 'https://testnet.nearblocks.io/txns/';
export const EXPLORER_ACCOUNT = 'https://testnet.nearblocks.io/address/';

export const ENV_ACCOUNT = 'NEAR_TESTNET_ACCOUNT_ID';
export const ENV_KEY = 'NEAR_TESTNET_PRIVATE_KEY';

export function makeProvider() {
  return new FailoverRpcProvider(RPC_URLS.map((url) => new JsonRpcProvider({ url })));
}

/** Parses KEY=VALUE lines of the root .env (no interpolation, comments ignored). */
export function readEnv() {
  const out = {};
  if (!existsSync(ENV_PATH)) return out;
  for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/**
 * Sets the given keys in the root .env. Existing lines for these keys are replaced in place
 * (the previous value is kept as a comment so an old testnet account stays recoverable);
 * every other line is preserved untouched; missing keys are appended.
 */
export function upsertEnv(values) {
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8').split(/\r?\n/) : [];
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const pending = new Map(Object.entries(values));
  const stamp = new Date().toISOString();
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && pending.has(m[1])) {
      const key = m[1];
      const next = `${key}=${pending.get(key)}`;
      if (line.trim() !== next) out.push(`# replaced ${stamp}: ${line.trim()}`);
      out.push(next);
      pending.delete(key);
    } else {
      out.push(line);
    }
  }
  for (const [k, v] of pending) out.push(`${k}=${v}`);
  writeFileSync(ENV_PATH, `${out.join('\n')}\n`, 'utf8');
}

export function txHashOf(result) {
  return result?.transaction?.hash ?? result?.transaction_outcome?.id;
}

/** Sum of gas burnt by the transaction and all of its receipts. */
export function totalGasBurnt(result) {
  let total = BigInt(result.transaction_outcome.outcome.gas_burnt);
  for (const r of result.receipts_outcome) total += BigInt(r.outcome.gas_burnt);
  return total;
}

export function allLogs(result) {
  return result.receipts_outcome.flatMap((r) => r.outcome.logs);
}

/** Decodes the JSON return value of a successful function-call transaction. */
export function returnValue(result) {
  const v = result?.status?.SuccessValue;
  if (v === undefined || v === '') return undefined;
  return JSON.parse(Buffer.from(v, 'base64').toString('utf8'));
}

export function fmtNear(yocto) {
  const y = BigInt(yocto);
  const whole = y / 10n ** 24n;
  const frac = (y % 10n ** 24n).toString().padStart(24, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function tgas(gas) {
  return `${(Number(BigInt(gas)) / 1e12).toFixed(3)} Tgas`;
}

/** Raw JSON-RPC call with endpoint failover (used where a "not found" answer is expected). */
export async function rpc(method, params) {
  let lastError;
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'perde', method, params }),
      });
      if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/** Returns the raw view_account result, or null when the account does not exist. */
export async function viewAccountRaw(accountId, finality = 'final') {
  const body = await rpc('query', { request_type: 'view_account', finality, account_id: accountId });
  if (body.result) return body.result;
  const err = body.error;
  if (err?.cause?.name === 'UNKNOWN_ACCOUNT' || /does not exist/i.test(JSON.stringify(err))) return null;
  throw new Error(`view_account ${accountId} failed: ${JSON.stringify(err)}`);
}

export async function accountExists(_provider, accountId) {
  return (await viewAccountRaw(accountId)) !== null;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
