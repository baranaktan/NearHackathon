/**
 * Route mock for every external origin the app contacts (NEAR testnet RPC,
 * 1Click, the testnet faucet). Answers come from RECORDED fixtures
 * (e2e/fixtures/recorded/, written by scripts/record-fixtures.mjs from the
 * real APIs). A small "virtual contract" serves `announcement_count` /
 * `get_announcements` from the recorded announcement list (or a test's own
 * list), and accounts a test declares as existing get the recorded
 * `view_account` shape. Anything the fixtures cannot answer is reported in
 * `unhandled` and fails the test (see support/test.ts) — the mock never
 * invents chain data silently.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Request, Route } from '@playwright/test';
import { FAUCET_HOST, ONECLICK_HOST, RPC_HOST_RE, rpcKey } from './rpc-key.mjs';

interface RpcAnswer {
  result?: unknown;
  error?: unknown;
}
const fixtureDir = fileURLToPath(new URL('../fixtures/recorded/', import.meta.url));
const RPC_FIXTURE = JSON.parse(readFileSync(`${fixtureDir}testnet-rpc.json`, 'utf8')) as { readonlyWallet: string; responses: Record<string, RpcAnswer> };
const ONECLICK_FIXTURE = JSON.parse(readFileSync(`${fixtureDir}oneclick.json`, 'utf8')) as { responses: Record<string, { status: number; body: unknown }> };

export interface AnnouncementJson {
  index: number;
  stealth_account: string;
  ephemeral_pk: string;
  view_tag: number;
  amount: string;
  timestamp_ms: number;
}

const CONTRACT = 'perde-pay.testnet';
const responses = RPC_FIXTURE.responses;
const findKey = (pred: (k: string) => boolean): RpcAnswer => {
  const k = Object.keys(responses).find(pred);
  if (!k) throw new Error('recorded fixture missing');
  return responses[k] as RpcAnswer;
};
const viewResult = (k: string) => (responses[k]?.result ?? null) as { block_hash: string; block_height: number; logs: string[]; result: number[] } | null;

/** The recorded announcements (real testnet data). */
export const RECORDED_ANNOUNCEMENTS: AnnouncementJson[] = (() => {
  const r = viewResult(rpcKey('query', { request_type: 'call_function', account_id: CONTRACT, method_name: 'get_announcements', args_base64: Buffer.from(JSON.stringify({ from_index: 0, limit: 200 })).toString('base64') }));
  if (!r) throw new Error('recorded get_announcements missing');
  return JSON.parse(Buffer.from(r.result).toString('utf8')) as AnnouncementJson[];
})();

const TEMPLATE_EXISTING_ACCOUNT = responses[rpcKey('query', { request_type: 'view_account', account_id: RPC_FIXTURE.readonlyWallet })] as RpcAnswer;
const TEMPLATE_MISSING_ACCOUNT = responses[rpcKey('query', { request_type: 'view_account', account_id: 'perde-e2e-missing-account.testnet' })] as RpcAnswer;
const TEMPLATE_UNREGISTERED = findKey((k) => k.includes('get_meta_address') && k.includes('perde-unregistered-e2e.testnet'));
const TEMPLATE_ACCESS_KEY = findKey((k) => k.includes('"request_type":"view_access_key"'));
const TEMPLATE_UNKNOWN_TX = findKey((k) => k.startsWith('tx ') && k.includes('9Qg1J7dGLUUxN4uAsSsLtczSWUM1zW2DAoqPLQ29VZ2p'));
const TEMPLATE_VIEW = findKey((k) => k.includes('"method_name":"announcement_count"')).result as { block_hash: string; block_height: number };

/** RECORDED `EXPERIMENTAL_tx_status` answers of real testnet transactions (fixtures/recorded/testnet-tx-status.json). */
export const RECORDED_TX_STATUS = (
  JSON.parse(readFileSync(`${fixtureDir}testnet-tx-status.json`, 'utf8')) as { transactions: Record<'send' | 'daoPayout' | 'plainTransfer', { transaction: { hash: string } }> }
).transactions;

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** A deterministic, well-formed NEAR transaction hash (base58 of 32 bytes) for SYNTHETIC answers. */
export function syntheticTxHash(seed: string): string {
  let n = BigInt(`0x${createHash('sha256').update(seed).digest('hex')}`);
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  return out;
}

/**
 * SYNTHETIC `EXPERIMENTAL_tx_status` answer: the RECORDED Perde send with its
 * hash, stealth account, ephemeral key, view tag and announcement index
 * replaced, i.e. what the chain would answer for a send to `stealth`. Used with
 * the SYNTHETIC announcements, whose payments never happened on chain.
 */
export function syntheticSendTxStatus(p: { hash: string; stealth: string; ephemeralPk: string; viewTag: number; index: number }): unknown {
  const rec = RECORDED_TX_STATUS.send as unknown as { transaction: { hash: string }; receipts_outcome: Array<{ outcome: { logs: string[] } }> };
  const ev = (() => {
    for (const o of rec.receipts_outcome) for (const l of o.outcome.logs) if (l.startsWith('EVENT_JSON:')) return (JSON.parse(l.slice(11)) as { data: Array<{ stealth_account: string; ephemeral_pk: string; view_tag: number; index: number }> }).data[0]!;
    throw new Error('recorded send has no announce event');
  })();
  const text = JSON.stringify(rec)
    .replaceAll(rec.transaction.hash, p.hash)
    .replaceAll(ev.stealth_account, p.stealth)
    .replaceAll(ev.ephemeral_pk, p.ephemeralPk)
    .replaceAll(`\\"view_tag\\":${ev.view_tag}`, `\\"view_tag\\":${p.viewTag}`)
    .replaceAll(`\\"index\\":${ev.index}`, `\\"index\\":${p.index}`);
  return { ...(JSON.parse(text) as object), _synthetic: 'SYNTHETIC: recorded send with replaced hash / stealth account / ephemeral key / view tag / index' };
}

export type RpcMode = 'fixtures' | 'down' | 'malformed' | 'http500';
export type OneClickMode = 'fixtures' | 'http500' | 'timeout' | 'down';
export type FaucetMode = 'unexpected' | 'rate-limited';

export interface ChainMockOptions {
  rpc?: RpcMode;
  /** Delay before every RPC answer (slow network). */
  rpcDelayMs?: number;
  oneClick?: OneClickMode;
  faucet?: FaucetMode;
  /** Accounts that exist on the mocked chain (get the recorded view_account answer). */
  existingAccounts?: string[];
  /** Replace the recorded announcement list (e.g. a synthetic 600-entry list for the scan benchmark). */
  announcements?: AnnouncementJson[];
  /** Registered name → meta-address (otherwise the recorded "null" answer). */
  names?: Record<string, string>;
  /** What `send_tx` does: abort (network failure after signing) or hang until the test releases it. */
  sendTx?: 'abort' | 'hang';
  /** `EXPERIMENTAL_tx_status` answers by hash (RECORDED_TX_STATUS or syntheticSendTxStatus); other hashes are unknown. */
  txStatus?: Record<string, unknown>;
}

export interface RpcCall {
  method: string;
  key: string;
  host: string;
}

export class ChainMock {
  readonly calls: RpcCall[] = [];
  readonly unhandled: string[] = [];
  readonly oneClickCalls: string[] = [];
  readonly faucetCalls: number[] = [];
  opts: Required<Omit<ChainMockOptions, 'names' | 'txStatus'>> & { names: Record<string, string>; txStatus: Record<string, unknown> };
  #releaseHung: Array<() => void> = [];

  constructor(options: ChainMockOptions = {}) {
    this.opts = {
      rpc: options.rpc ?? 'fixtures',
      rpcDelayMs: options.rpcDelayMs ?? 0,
      oneClick: options.oneClick ?? 'fixtures',
      faucet: options.faucet ?? 'unexpected',
      existingAccounts: options.existingAccounts ?? [],
      announcements: options.announcements ?? RECORDED_ANNOUNCEMENTS,
      names: options.names ?? {},
      sendTx: options.sendTx ?? 'abort',
      txStatus: options.txStatus ?? {},
    };
  }

  set(options: ChainMockOptions): void {
    Object.assign(this.opts, options);
  }

  /** Let every hung send_tx fail (as if the connection dropped). */
  releaseHung(): void {
    this.opts.sendTx = 'abort';
    for (const r of this.#releaseHung.splice(0)) r();
  }

  count(method: string): number {
    return this.calls.filter((c) => c.method === method).length;
  }

  async install(context: BrowserContext): Promise<void> {
    await context.route((url) => RPC_HOST_RE.test(url.hostname), (route) => this.#rpc(route));
    await context.route((url) => url.hostname === ONECLICK_HOST, (route) => this.#oneClick(route));
    await context.route((url) => url.hostname === FAUCET_HOST, (route) => this.#faucet(route));
  }

  #cors(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-expose-headers': '*',
      ...extra,
    };
  }

  async #preflight(route: Route, req: Request): Promise<boolean> {
    if (req.method() !== 'OPTIONS') return false;
    await route.fulfill({ status: 204, headers: this.#cors() });
    return true;
  }

  async #rpc(route: Route): Promise<void> {
    const req = route.request();
    if (await this.#preflight(route, req)) return;
    const host = new URL(req.url()).hostname;
    let body: { id?: number; method?: string; params?: unknown };
    try {
      body = JSON.parse(req.postData() ?? '{}') as typeof body;
    } catch {
      body = {};
    }
    const method = body.method ?? '?';
    const key = rpcKey(method, body.params);
    this.calls.push({ method, key, host });
    if (this.opts.rpcDelayMs > 0) await new Promise((r) => setTimeout(r, this.opts.rpcDelayMs));
    const mode = this.opts.rpc;
    if (mode === 'down') return route.abort('connectionrefused').catch(() => undefined);
    if (mode === 'malformed') return route.fulfill({ status: 200, headers: this.#cors({ 'content-type': 'application/json' }), body: '{"jsonrpc":"2.0","id":1,"result":' }).catch(() => undefined);
    if (mode === 'http500') return route.fulfill({ status: 500, headers: this.#cors({ 'content-type': 'text/plain' }), body: 'Internal Server Error' }).catch(() => undefined);
    if (method === 'send_tx') {
      if (this.opts.sendTx === 'hang') await new Promise<void>((r) => this.#releaseHung.push(r));
      return route.abort('connectionreset').catch(() => undefined);
    }
    const answer = this.answer(method, body.params, key);
    if (answer === null) {
      this.unhandled.push(key.slice(0, 300));
      return route.fulfill({
        status: 200,
        headers: this.#cors({ 'content-type': 'application/json' }),
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { name: 'HANDLER_ERROR', cause: { name: 'E2E_NOT_RECORDED', info: {} }, code: -32000, message: 'Server error', data: `no recorded fixture for ${key.slice(0, 200)}` } }),
      }).catch(() => undefined);
    }
    await route.fulfill({ status: 200, headers: this.#cors({ 'content-type': 'application/json' }), body: JSON.stringify({ jsonrpc: '2.0', id: body.id, ...answer }) }).catch(() => undefined);
  }

  /** The answer a node would give, from recorded fixtures; null when there is none. */
  answer(method: string, params: unknown, key: string): RpcAnswer | null {
    const p = (params ?? {}) as Record<string, unknown>;
    if (method === 'query' && p.request_type === 'call_function' && p.account_id === CONTRACT) {
      const args = JSON.parse(Buffer.from(String(p.args_base64 ?? ''), 'base64').toString('utf8') || '{}') as Record<string, unknown>;
      const list = this.opts.announcements;
      if (p.method_name === 'announcement_count') return this.#view(list.length);
      if (p.method_name === 'get_announcements') {
        const from = Number(args.from_index ?? 0);
        const limit = Number(args.limit ?? 200);
        return this.#view(list.slice(from, from + limit));
      }
      if (p.method_name === 'get_meta_address') {
        const name = String(args.account_id);
        if (name in this.opts.names) return this.#view(this.opts.names[name]);
        return responses[key] ?? TEMPLATE_UNREGISTERED;
      }
    }
    if (method === 'query' && p.request_type === 'view_account') {
      const id = String(p.account_id);
      if (this.opts.existingAccounts.includes(id)) return TEMPLATE_EXISTING_ACCOUNT;
      if (responses[key]) return responses[key] as RpcAnswer;
      return JSON.parse(JSON.stringify(TEMPLATE_MISSING_ACCOUNT).replaceAll('perde-e2e-missing-account.testnet', id)) as RpcAnswer;
    }
    if (method === 'query' && p.request_type === 'view_access_key' && this.opts.existingAccounts.includes(String(p.account_id))) return TEMPLATE_ACCESS_KEY;
    if (method === 'EXPERIMENTAL_tx_status' && typeof p.tx_hash === 'string' && p.tx_hash in this.opts.txStatus) return { result: this.opts.txStatus[p.tx_hash] };
    if ((method === 'tx' || method === 'EXPERIMENTAL_tx_status') && typeof p.tx_hash === 'string') {
      return JSON.parse(JSON.stringify(TEMPLATE_UNKNOWN_TX).replaceAll('9Qg1J7dGLUUxN4uAsSsLtczSWUM1zW2DAoqPLQ29VZ2p', p.tx_hash)) as RpcAnswer;
    }
    if (method === 'block' || method === 'gas_price' || method === 'EXPERIMENTAL_protocol_config') {
      return (Object.entries(responses).find(([k]) => k === method || k.startsWith(`${method} `))?.[1] as RpcAnswer | undefined) ?? null;
    }
    return (responses[key] as RpcAnswer | undefined) ?? null;
  }

  #view(value: unknown): RpcAnswer {
    return { result: { block_hash: TEMPLATE_VIEW.block_hash, block_height: TEMPLATE_VIEW.block_height, logs: [], result: [...Buffer.from(JSON.stringify(value), 'utf8')] } };
  }

  async #oneClick(route: Route): Promise<void> {
    const req = route.request();
    if (await this.#preflight(route, req)) return;
    const u = new URL(req.url());
    const key = `${req.method()} ${u.pathname}`;
    this.oneClickCalls.push(key);
    const mode = this.opts.oneClick;
    if (mode === 'down') return route.abort('connectionrefused').catch(() => undefined);
    if (mode === 'timeout' && key === 'POST /v0/quote') return; // never answered: the client's own timeout must fire
    if (mode === 'http500' && key === 'POST /v0/quote') {
      return route.fulfill({ status: 500, headers: this.#cors({ 'content-type': 'application/json' }), body: JSON.stringify({ message: 'Internal server error' }) }).catch(() => undefined);
    }
    const rec = ONECLICK_FIXTURE.responses[key];
    if (!rec) {
      this.unhandled.push(`1Click ${key}`);
      return route.fulfill({ status: 404, headers: this.#cors(), body: '{}' }).catch(() => undefined);
    }
    let body = rec.body as Record<string, unknown>;
    if (key === 'POST /v0/quote') {
      // Echo the request back the way the API does, so the shown quote matches what was asked.
      const sent = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
      body = { ...body, quoteRequest: { ...(body.quoteRequest as object), ...sent }, timestamp: new Date().toISOString() };
    }
    await route.fulfill({ status: rec.status, headers: this.#cors({ 'content-type': 'application/json' }), body: JSON.stringify(body) }).catch(() => undefined);
  }

  async #faucet(route: Route): Promise<void> {
    const req = route.request();
    if (await this.#preflight(route, req)) return;
    this.faucetCalls.push(Date.now());
    if (this.opts.faucet === 'rate-limited') {
      const reset = Math.floor(Date.now() / 1000) + 3 * 3600;
      // Shape of the helper's real 429 (rate-limit headers as observed on 2026-11-14, see core/faucet.ts).
      return route
        .fulfill({
          status: 429,
          headers: this.#cors({ 'content-type': 'text/plain', 'x-ratelimit-limit': '10', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }),
          body: 'Too Many Requests',
        })
        .catch(() => undefined);
    }
    this.unhandled.push('faucet POST (the offline suite never creates accounts)');
    await route.abort('blockedbyclient').catch(() => undefined);
  }
}
