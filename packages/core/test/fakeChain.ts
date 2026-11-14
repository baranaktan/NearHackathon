import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58, base64 } from '@scure/base';
import { decodeSignedTransaction, encodeTransaction } from 'near-api-js';
import { jsonResponse, mockFetch } from './helpers.js';

export interface FakeAnnouncement {
  index: number;
  stealth_account: string;
  ephemeral_pk: string;
  view_tag: number;
  amount: string;
  timestamp_ms: number;
}

export interface DecodedAction {
  kind: 'transfer' | 'functionCall' | 'deleteAccount';
  deposit?: bigint;
  methodName?: string;
  args?: Record<string, unknown>;
  gas?: bigint;
  beneficiaryId?: string;
}

export interface SubmittedTx {
  signerId: string;
  receiverId: string;
  actions: DecodedAction[];
  signatureValid: boolean;
}

const GAS_PRICE = 100_000_000n;
export const ANNOUNCE_FEE = 2_000_000_000_000_000_000_000n;
export const MIN_AMOUNT = 10_000_000_000_000_000_000_000n;
export const BURN_PER_TX = 44_636_512_500_000_000_000n;

/**
 * In-memory NEAR + Perde contract simulator behind a mocked fetch. It checks
 * every submitted transaction's signature against its declared public key and
 * the key registered for the signer.
 */
export function fakeChain(contractId = 'perde.testnet') {
  const balances = new Map<string, bigint>();
  const keys = new Map<string, string>();
  const nonces = new Map<string, bigint>();
  const announcements: FakeAnnouncement[] = [];
  const directory = new Map<string, string>();
  const submitted: SubmittedTx[] = [];
  const outcomes = new Map<string, object>();

  const ok = (result: unknown) => jsonResponse({ jsonrpc: '2.0', id: 1, result });
  const handlerError = (name: string, data?: unknown) =>
    jsonResponse({ jsonrpc: '2.0', id: 1, error: { name: 'HANDLER_ERROR', cause: { name, info: {} }, code: -32000, message: 'Server error', data: data ?? name } });
  const credit = (id: string, amount: bigint) => {
    if (!balances.has(id) && /^[0-9a-f]{64}$/.test(id)) keys.set(id, `ed25519:${base58.encode(Buffer.from(id, 'hex'))}`);
    balances.set(id, (balances.get(id) ?? 0n) + amount);
  };

  function view(method: string, args: Record<string, unknown>): unknown {
    switch (method) {
      case 'get_config':
        return { announce_fee: ANNOUNCE_FEE.toString(), min_amount: MIN_AMOUNT.toString(), version: '0.1.0' };
      case 'announcement_count':
        return announcements.length;
      case 'get_announcements': {
        const from = args.from_index as number;
        const limit = Math.min(args.limit as number, 200);
        return announcements.slice(from, from + limit);
      }
      case 'get_meta_address':
        return directory.get(args.account_id as string) ?? null;
      default:
        throw new Error(`unknown view ${method}`);
    }
  }

  function execute(tx: SubmittedTx): { value: unknown } {
    let value: unknown = '';
    for (const a of tx.actions) {
      const spend = (amount: bigint) => {
        const bal = balances.get(tx.signerId) ?? 0n;
        if (bal < amount) throw new Error('NotEnoughBalance');
        balances.set(tx.signerId, bal - amount);
      };
      if (a.kind === 'transfer') {
        spend(a.deposit ?? 0n);
        credit(tx.receiverId, a.deposit ?? 0n);
      } else if (a.kind === 'deleteAccount') {
        const bal = balances.get(tx.signerId) ?? 0n;
        balances.delete(tx.signerId);
        keys.delete(tx.signerId);
        credit(a.beneficiaryId as string, bal - BURN_PER_TX);
      } else {
        spend(a.deposit ?? 0n);
        if (a.methodName === 'send') {
          const args = a.args as { stealth_account: string; ephemeral_pk: string; view_tag: number };
          const amount = (a.deposit ?? 0n) - ANNOUNCE_FEE;
          const index = announcements.length;
          announcements.push({ index, stealth_account: args.stealth_account, ephemeral_pk: args.ephemeral_pk, view_tag: args.view_tag, amount: amount.toString(), timestamp_ms: 1_700_000_000_000 + index });
          credit(args.stealth_account, amount);
          value = index;
        } else if (a.methodName === 'register') {
          directory.set(tx.signerId, (a.args as { meta_address: string }).meta_address);
        }
      }
    }
    if (tx.actions[0]?.kind !== 'deleteAccount') spend(tx.signerId, BURN_PER_TX);
    return { value };
  }

  function spend(id: string, amount: bigint) {
    balances.set(id, (balances.get(id) ?? 0n) - amount);
  }

  const { fetch, calls } = mockFetch((_url, body) => {
    const { method, params } = body as { method: string; params: Record<string, unknown> };
    if (method === 'query') {
      const rt = params.request_type as string;
      if (rt === 'view_account') {
        const id = params.account_id as string;
        const bal = balances.get(id);
        if (bal === undefined) return handlerError('UNKNOWN_ACCOUNT', `account ${id} does not exist while viewing`);
        return ok({ amount: bal.toString(), locked: '0', code_hash: '11111111111111111111111111111111', storage_usage: 182, block_height: 1, block_hash: 'h' });
      }
      if (rt === 'view_access_key') {
        const id = params.account_id as string;
        if (keys.get(id) !== params.public_key) return handlerError('UNKNOWN_ACCESS_KEY');
        return ok({ nonce: Number(nonces.get(id) ?? 0n), permission: 'FullAccess', block_hash: 'h', block_height: 1 });
      }
      if (rt === 'call_function') {
        if (params.account_id !== contractId) return handlerError('UNKNOWN_ACCOUNT');
        const args = JSON.parse(new TextDecoder().decode(base64.decode(params.args_base64 as string))) as Record<string, unknown>;
        const result = view(params.method_name as string, args);
        return ok({ result: [...new TextEncoder().encode(JSON.stringify(result))], logs: [] });
      }
    }
    if (method === 'block') return ok({ header: { hash: '5UjcpD56pkiYoChcw2WcFvsy1mj5LFnkYnTLbnzPfWdD', height: 100 } });
    if (method === 'gas_price') return ok({ gas_price: GAS_PRICE.toString() });
    if (method === 'EXPERIMENTAL_protocol_config') return handlerError('UNSUPPORTED');
    if (method === 'send_tx') {
      const bytes = base64.decode(params.signed_tx_base64 as string);
      const stx = decodeSignedTransaction(bytes);
      const t = stx.transaction;
      const pkString = t.publicKey.toString();
      const txHash = sha256(encodeTransaction(t));
      const sig = stx.signature.ed25519Signature?.data ?? new Uint8Array();
      const signatureValid = ed25519.verify(sig, txHash, t.publicKey.data) && keys.get(t.signerId) === pkString;
      const actions: DecodedAction[] = t.actions.map((a) => {
        if (a.transfer) return { kind: 'transfer', deposit: a.transfer.deposit };
        if (a.deleteAccount) return { kind: 'deleteAccount', beneficiaryId: a.deleteAccount.beneficiaryId };
        if (a.functionCall) {
          return {
            kind: 'functionCall',
            methodName: a.functionCall.methodName,
            args: JSON.parse(new TextDecoder().decode(Uint8Array.from(a.functionCall.args))) as Record<string, unknown>,
            gas: a.functionCall.gas,
            deposit: a.functionCall.deposit,
          };
        }
        throw new Error('unexpected action');
      });
      const sub: SubmittedTx = { signerId: t.signerId, receiverId: t.receiverId, actions, signatureValid };
      submitted.push(sub);
      if (!signatureValid) return handlerError('INVALID_TRANSACTION', { TxExecutionError: { InvalidTxError: 'InvalidSignature' } });
      if (t.nonce <= (nonces.get(t.signerId) ?? 0n)) return handlerError('INVALID_TRANSACTION', { TxExecutionError: { InvalidTxError: { InvalidNonce: {} } } });
      nonces.set(t.signerId, t.nonce);
      const hash = base58.encode(txHash);
      let status: object;
      try {
        const { value } = execute(sub);
        status = { SuccessValue: base64.encode(new TextEncoder().encode(value === '' ? '' : JSON.stringify(value))) };
      } catch (e) {
        status = { Failure: { ActionError: { kind: (e as Error).message } } };
      }
      const o = { executor_id: t.signerId, gas_burnt: 446365125000, tokens_burnt: BURN_PER_TX.toString(), logs: [], receipt_ids: [], status };
      const result = { final_execution_status: 'EXECUTED_OPTIMISTIC', status, transaction: { hash, signer_id: t.signerId, receiver_id: t.receiverId }, transaction_outcome: { id: hash, block_hash: 'b', outcome: { ...o, tokens_burnt: '0', gas_burnt: 0 } }, receipts_outcome: [{ id: 'r', block_hash: 'b', outcome: o }] };
      outcomes.set(`${hash}|${t.signerId}`, result);
      return ok(result);
    }
    if (method === 'tx') {
      const found = outcomes.get(`${String(params.tx_hash)}|${String(params.sender_account_id)}`);
      return found ? ok(found) : handlerError('UNKNOWN_TRANSACTION');
    }
    throw new Error(`fake chain: unhandled ${method}`);
  });

  return {
    fetch,
    calls,
    balances,
    announcements,
    directory,
    submitted,
    addAccount(id: string, publicKey: string, balance: bigint) {
      balances.set(id, balance);
      keys.set(id, publicKey);
    },
    fund(id: string, amount: bigint) {
      credit(id, amount);
    },
  };
}
