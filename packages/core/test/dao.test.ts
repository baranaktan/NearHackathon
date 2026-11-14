import { sha256 } from '@noble/hashes/sha2.js';
import { base58, base64 } from '@scure/base';
import { decodeSignedTransaction, encodeTransaction } from 'near-api-js';
import { describe, expect, it } from 'vitest';
import {
  actProposalGas,
  buildStealthPaymentProposal,
  DAO_BATCH_SEND_GAS,
  DAO_SEND_GAS,
  DEFAULT_PAYMENT_DESCRIPTION,
  deriveStealth,
  describeProposal,
  encodeDaoCreateArgs,
  encodeMetaAddress,
  encodeViewingKey,
  isCompleteOutcome,
  isPerdeError,
  isReadLagError,
  keysFromSeed,
  NearRpc,
  parseOutcome,
  pollUntil,
  RpcError,
  openDemoPolicy,
  parseNear,
  proposalKindLabel,
  scanAnnouncement,
  SeedSigner,
  SputnikDao,
  type SputnikProposal,
  type SputnikProposalInput,
  tgas,
  verifyReceipt,
} from '../src/index.js';
import { jsonResponse, mockFetch } from './helpers.js';

const PERDE = 'perde.testnet';
const DAO = 'demo.sputnikv2.testnet';
const FEE = parseNear('0.002');
const MIN = parseNear('0.01');
const BOND = parseNear('0.01');

const bob = keysFromSeed(new Uint8Array(64).fill(7));
const bobMeta = encodeMetaAddress(bob);

function decodeArgs(b64: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64.decode(b64)));
}

interface ActCall {
  signerId: string;
  method: string;
  args: Record<string, unknown>;
  deposit: bigint;
  gas: bigint;
}

/** Exact body testnet RPCs return for a view that panics (legacy shape: `result.error`, no `result` bytes). */
function legacyViewPanic(msg: string): Response {
  return jsonResponse({
    jsonrpc: '2.0',
    id: 1,
    result: { block_hash: '8yxNqkt2xFGxKDb2g5mDqrr4mwur7MpwcftaHjERPpa9', block_height: 277585585, error: `wasm execution failed with error: HostError(GuestPanic { panic_msg: "panicked at '${msg}', sputnikdao2/src/views.rs:102:48" })`, logs: [] },
  });
}

/**
 * In-memory SputnikDAO + Perde views behind a mocked fetch. `lag` simulates
 * a load-balanced RPC whose node has not applied the latest block: the next
 * `lag` get_proposal reads after each write return the previous state (or
 * ERR_NO_PROPOSAL, in the legacy error shape, for a just-added proposal).
 */
function fakeDao(options: { available?: bigint; lag?: number } = {}) {
  const signer = SeedSigner.fromSeed(new Uint8Array(32).fill(3));
  const pk = `ed25519:${base58.encode(signer.publicKey)}`;
  const proposals: SputnikProposal[] = [];
  const calls: ActCall[] = [];
  let nonce = 0n;
  const directory = new Map<string, string>([['bob.testnet', bobMeta]]);
  const policy = openDemoPolicy({ proposalBondYocto: BOND, proposalPeriodNs: 3_600_000_000_000n, council: ['admin.testnet'] });
  let staleReads = 0;
  const previous = new Map<number, SputnikProposal | undefined>();
  const stats = { staleServed: 0 };
  const touch = (id: number) => {
    const cur = proposals[id];
    previous.set(id, cur === undefined ? undefined : { ...cur });
    staleReads = options.lag ?? 0;
  };

  const ok = (result: unknown) => jsonResponse({ jsonrpc: '2.0', id: 1, result });
  const err = (name: string) => jsonResponse({ jsonrpc: '2.0', id: 1, error: { name: 'HANDLER_ERROR', cause: { name }, data: name } });
  const viewResult = (v: unknown) => ok({ result: [...new TextEncoder().encode(JSON.stringify(v))], logs: [] });

  const { fetch } = mockFetch((_url, body) => {
    const { method, params } = body as { method: string; params: Record<string, unknown> };
    if (method === 'query') {
      const rt = params.request_type as string;
      if (rt === 'view_access_key') return ok({ nonce: Number(nonce), permission: 'FullAccess', block_hash: 'h', block_height: 1 });
      if (rt === 'view_account') return ok({ amount: parseNear('6').toString(), locked: '0', code_hash: 'c', storage_usage: 541_000, block_height: 1, block_hash: 'h' });
      if (rt === 'call_function') {
        const args = decodeArgs(params.args_base64 as string) as Record<string, unknown>;
        const m = params.method_name as string;
        if (params.account_id === PERDE) {
          if (m === 'get_config') return viewResult({ announce_fee: FEE.toString(), min_amount: MIN.toString(), version: '1.0.0' });
          if (m === 'get_meta_address') return viewResult(directory.get(args.account_id as string) ?? null);
        }
        if (params.account_id === DAO) {
          if (m === 'get_policy') return viewResult(policy);
          if (m === 'get_available_amount') return viewResult((options.available ?? parseNear('3')).toString());
          if (m === 'get_locked_storage_amount') return viewResult(parseNear('5.41').toString());
          if (m === 'get_last_proposal_id') return viewResult(proposals.length);
          if (m === 'get_proposal') {
            const id = args.id as number;
            if (staleReads > 0 && previous.has(id)) {
              staleReads--;
              stats.staleServed++;
              const old = previous.get(id);
              return old === undefined ? legacyViewPanic('ERR_NO_PROPOSAL') : viewResult(old);
            }
            const p = proposals[id];
            return p === undefined ? legacyViewPanic('ERR_NO_PROPOSAL') : viewResult(p);
          }
          if (m === 'get_proposals') return viewResult(proposals.slice(args.from_index as number, (args.from_index as number) + (args.limit as number)));
        }
        return err('CONTRACT_EXECUTION_ERROR');
      }
    }
    if (method === 'block') return ok({ header: { hash: '5UjcpD56pkiYoChcw2WcFvsy1mj5LFnkYnTLbnzPfWdD', height: 100 } });
    if (method === 'send_tx') {
      const stx = decodeSignedTransaction(base64.decode(params.signed_tx_base64 as string));
      const t = stx.transaction;
      nonce = t.nonce;
      const hash = base58.encode(sha256(encodeTransaction(t)));
      const fc = t.actions[0]?.functionCall;
      if (fc === undefined || t.receiverId !== DAO) throw new Error('unexpected tx');
      const args = JSON.parse(new TextDecoder().decode(Uint8Array.from(fc.args))) as Record<string, unknown>;
      calls.push({ signerId: t.signerId, method: fc.methodName, args, deposit: fc.deposit, gas: fc.gas });
      let status: object = { SuccessValue: '' };
      const receipts: object[] = [];
      if (fc.methodName === 'add_proposal') {
        if (fc.deposit !== BOND) {
          status = { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: ERR_MIN_BOND' } } } } };
        } else {
          const input = args.proposal as SputnikProposalInput;
          touch(proposals.length);
          proposals.push({ id: proposals.length, proposer: t.signerId, description: input.description, kind: input.kind, status: 'InProgress', vote_counts: {}, votes: {}, submission_time: '1' });
          status = { SuccessValue: base64.encode(new TextEncoder().encode(String(proposals.length - 1))) };
        }
      } else if (fc.methodName === 'act_proposal') {
        const p = proposals[args.id as number];
        if (p === undefined) throw new Error('no proposal');
        const approve = args.action === 'VoteApprove';
        touch(p.id);
        proposals[p.id] = { ...p, status: approve ? 'Approved' : 'Rejected', vote_counts: { 'open-voters': approve ? [1, 0, 0] : [0, 1, 0] }, votes: { [t.signerId]: approve ? 'Approve' : 'Reject' } };
        if (approve) receipts.push({ id: 'r2', block_hash: 'b', outcome: { executor_id: PERDE, gas_burnt: 1, tokens_burnt: '0', logs: [], receipt_ids: [], status: { SuccessValue: 'MA==' } } });
      }
      const o = { executor_id: DAO, gas_burnt: 1, tokens_burnt: '0', logs: [], receipt_ids: [], status };
      return ok({ final_execution_status: 'EXECUTED_OPTIMISTIC', status, transaction: { hash, signer_id: t.signerId, receiver_id: t.receiverId }, transaction_outcome: { id: hash, block_hash: 'b', outcome: o }, receipts_outcome: [{ id: 'r1', block_hash: 'b', outcome: o }, ...receipts] });
    }
    throw new Error(`unhandled ${method}`);
  });
  const dao = new SputnikDao({ network: 'testnet', daoId: DAO, perdeContractId: PERDE, rpcUrls: ['https://rpc.test'], fetch });
  return { dao, signer, pk, proposals, calls, policy, stats, fetch };
}

describe('buildStealthPaymentProposal (pure)', () => {
  const s = deriveStealth(bobMeta, 12345n);
  const leg = { stealthAccountId: s.stealthAccountId, ephemeralPk: s.ephemeralPk, viewTag: s.viewTag, amountYocto: parseNear('0.05') };

  it('encodes one send FunctionCall: base64 JSON args, deposit = amount + fee, 30 Tgas', () => {
    const p = buildStealthPaymentProposal({ contractId: PERDE, announceFee: FEE, payments: leg });
    expect(p.description).toBe(DEFAULT_PAYMENT_DESCRIPTION);
    expect(p.kind).toEqual({
      FunctionCall: {
        receiver_id: PERDE,
        actions: [{ method_name: 'send', args: expect.any(String) as string, deposit: (parseNear('0.05') + FEE).toString(), gas: DAO_SEND_GAS.toString() }],
      },
    });
    const action = (p.kind as { FunctionCall: { actions: { args: string }[] } }).FunctionCall.actions[0];
    // exact byte layout the Perde contract parses
    expect(new TextDecoder().decode(base64.decode(action?.args ?? ''))).toBe(`{"stealth_account":"${s.stealthAccountId}","ephemeral_pk":"${s.ephemeralPk}","view_tag":${s.viewTag}}`);
    // nothing in the proposal identifies the recipient
    expect(JSON.stringify(p)).not.toContain(bobMeta);
  });

  it('several payments use 15 Tgas each and are bounded by the proposal gas budget', () => {
    const p = buildStealthPaymentProposal({ contractId: PERDE, announceFee: FEE, payments: [leg, leg, leg] });
    const actions = (p.kind as { FunctionCall: { actions: { gas: string }[] } }).FunctionCall.actions;
    expect(actions.map((a) => a.gas)).toEqual(Array(3).fill(DAO_BATCH_SEND_GAS.toString()));
    expect(() => buildStealthPaymentProposal({ contractId: PERDE, announceFee: FEE, payments: Array<typeof leg>(17).fill(leg) })).toThrow(/split/);
    expect(() => buildStealthPaymentProposal({ contractId: PERDE, announceFee: FEE, payments: [] })).toThrow();
  });

  it('rejects malformed legs', () => {
    expect(() => buildStealthPaymentProposal({ contractId: PERDE, announceFee: FEE, payments: { ...leg, stealthAccountId: 'bob.testnet' } })).toThrow();
    expect(() => buildStealthPaymentProposal({ contractId: PERDE, announceFee: FEE, payments: { ...leg, ephemeralPk: 'AB'.repeat(32) } })).toThrow();
    expect(() => buildStealthPaymentProposal({ contractId: PERDE, announceFee: FEE, payments: { ...leg, viewTag: 256 } })).toThrow();
    expect(() => buildStealthPaymentProposal({ contractId: PERDE, announceFee: FEE, payments: { ...leg, amountYocto: 0n } })).toThrow();
    expect(() => buildStealthPaymentProposal({ contractId: 'Not Valid', announceFee: FEE, payments: leg })).toThrow();
  });
});

describe('describeProposal', () => {
  const s1 = deriveStealth(bobMeta, 1n);
  const s2 = deriveStealth(bobMeta, 2n);
  const input = buildStealthPaymentProposal({
    contractId: PERDE,
    announceFee: FEE,
    payments: [
      { stealthAccountId: s1.stealthAccountId, ephemeralPk: s1.ephemeralPk, viewTag: s1.viewTag, amountYocto: parseNear('0.05') },
      { stealthAccountId: s2.stealthAccountId, ephemeralPk: s2.ephemeralPk, viewTag: s2.viewTag, amountYocto: parseNear('0.2') },
    ],
  });
  const onChain: SputnikProposal = { id: 4, proposer: 'carol.testnet', status: 'Approved', vote_counts: { 'open-voters': [1, 0, 0], council: [1, 1, 0] }, votes: {}, submission_time: '1', ...input };

  it('extracts stealth accounts, deposits and (with the fee) amounts', () => {
    const d = describeProposal(onChain, { contractId: PERDE, announceFee: FEE });
    expect(d.type).toBe('perde-payment');
    if (d.type !== 'perde-payment') return;
    expect(d.id).toBe(4);
    expect(d.proposer).toBe('carol.testnet');
    expect(d.approvals).toBe(2);
    expect(d.rejections).toBe(1);
    expect(d.payments.map((p) => p.stealthAccountId)).toEqual([s1.stealthAccountId, s2.stealthAccountId]);
    expect(d.payments.map((p) => p.amountYocto)).toEqual([parseNear('0.05'), parseNear('0.2')]);
    expect(d.totalDepositYocto).toBe(parseNear('0.25') + 2n * FEE);
    expect(d.totalAmountYocto).toBe(parseNear('0.25'));
    // the recipient's viewing key recognises the decoded payment
    expect(scanAnnouncement(encodeViewingKey(bob), d.payments[0] as (typeof d.payments)[0])?.stealthAccountId).toBe(s1.stealthAccountId);
  });

  it('without a fee, amounts are unknown; another receiver or malformed args are "other"', () => {
    const d = describeProposal(input);
    expect(d.type === 'perde-payment' && d.payments[0]?.amountYocto).toBeUndefined();
    expect(describeProposal(onChain, { contractId: 'someone-else.testnet' }).type).toBe('other');
    const bad: SputnikProposalInput = { description: 'x', kind: { FunctionCall: { receiver_id: PERDE, actions: [{ method_name: 'send', args: '!!notbase64', deposit: '1', gas: '1' }] } } };
    expect(describeProposal(bad)).toMatchObject({ type: 'other', kindLabel: 'call' });
    const mixed: SputnikProposalInput = { description: 'x', kind: { FunctionCall: { receiver_id: PERDE, actions: [{ method_name: 'register', args: base64.encode(new TextEncoder().encode('{}')), deposit: '1', gas: '1' }] } } };
    expect(describeProposal(mixed).type).toBe('other');
  });

  it('labels non-call kinds like the policy does', () => {
    expect(describeProposal({ description: 'pay', kind: { Transfer: { token_id: '', receiver_id: 'bob.testnet', amount: '1' } } })).toMatchObject({ type: 'other', kindLabel: 'transfer' });
    expect(describeProposal({ description: 'poll', kind: 'Vote' })).toMatchObject({ type: 'other', kindLabel: 'vote' });
    expect(proposalKindLabel({ ChangePolicy: {} })).toBe('policy');
  });
});

describe('openDemoPolicy / encodeDaoCreateArgs', () => {
  it('uses a Member("0") role so public votes are counted; public limited to call proposals', () => {
    const policy = openDemoPolicy({ proposalBondYocto: BOND, proposalPeriodNs: 3_600_000_000_000n, council: ['admin.testnet'] });
    expect(policy.roles).toEqual([
      { name: 'all', kind: 'Everyone', permissions: ['call:AddProposal'], vote_policy: {} },
      { name: 'open-voters', kind: { Member: '0' }, permissions: ['call:VoteApprove', 'call:VoteReject', 'call:Finalize'], vote_policy: {} },
      { name: 'council', kind: { Group: ['admin.testnet'] }, permissions: ['*:*'], vote_policy: {} },
    ]);
    expect(policy.default_vote_policy).toEqual({ weight_kind: 'RoleWeight', quorum: '1', threshold: [1, 2] });
    expect(policy.proposal_bond).toBe('10000000000000000000000');
    const args = decodeArgs(encodeDaoCreateArgs({ name: 'demo', purpose: 'p', metadata: '' }, policy));
    expect(args).toEqual({ config: { name: 'demo', purpose: 'p', metadata: '' }, policy: JSON.parse(JSON.stringify(policy)) as unknown });
    expect(() => openDemoPolicy({ proposalBondYocto: BOND, proposalPeriodNs: 0n })).toThrow();
  });
});

describe('SputnikDao client (mocked RPC)', () => {
  it('proposeStealthPayment attaches exactly the bond and proposes perde.send with amount + fee', async () => {
    const f = fakeDao();
    const res = await f.dao.proposeStealthPayment(f.signer, 'carol.testnet', { recipient: bobMeta, amountYocto: parseNear('0.05') });
    expect(res.proposalId).toBe(0);
    expect(res.bondYocto).toBe(BOND);
    expect(res.depositYocto).toBe(parseNear('0.05') + FEE);
    const call = f.calls[0];
    expect(call).toMatchObject({ signerId: 'carol.testnet', method: 'add_proposal', deposit: BOND, gas: tgas(50) });
    const proposal = call?.args.proposal as SputnikProposalInput;
    expect(proposal.description).toBe(DEFAULT_PAYMENT_DESCRIPTION);
    const d = describeProposal(proposal, { contractId: PERDE, announceFee: FEE });
    expect(d.type === 'perde-payment' && d.payments[0]).toMatchObject({ stealthAccountId: res.stealthAccountId, ephemeralPk: res.ephemeralPk, viewTag: res.viewTag, amountYocto: parseNear('0.05') });
    // the recipient finds it from the proposal args alone; the sender holds a valid receipt
    expect(scanAnnouncement(encodeViewingKey(bob), { stealthAccountId: res.stealthAccountId, ephemeralPk: res.ephemeralPk, viewTag: res.viewTag })).not.toBeNull();
    expect(verifyReceipt(res.receipt)).toMatchObject({ valid: true, stealthAccountId: res.stealthAccountId });
    expect(JSON.stringify(call?.args)).not.toContain(bobMeta);
  });

  it('resolves registered names, refuses descriptions that name the recipient, checks the treasury and the minimum', async () => {
    const f = fakeDao();
    const viaName = await f.dao.proposeStealthPayment(f.signer, 'carol.testnet', { recipient: 'bob.testnet', amountYocto: '50000000000000000000000', description: 'Q3 design work' });
    expect(scanAnnouncement(bob, viaName)).not.toBeNull();
    await expect(f.dao.proposeStealthPayment(f.signer, 'carol.testnet', { recipient: 'bob.testnet', amountYocto: parseNear('0.05'), description: 'Pay Bob.testnet for design' })).rejects.toSatisfy((e) => isPerdeError(e, 'DAO_ERROR'));
    await expect(f.dao.proposeStealthPayment(f.signer, 'carol.testnet', { recipient: 'nobody.testnet', amountYocto: parseNear('0.05') })).rejects.toSatisfy((e) => isPerdeError(e, 'RECIPIENT_NOT_REGISTERED'));
    await expect(f.dao.proposeStealthPayment(f.signer, 'carol.testnet', { recipient: bobMeta, amountYocto: parseNear('0.001') })).rejects.toSatisfy((e) => isPerdeError(e, 'INVALID_AMOUNT'));
    const poor = fakeDao({ available: parseNear('0.03') });
    await expect(poor.dao.proposeStealthPayment(poor.signer, 'carol.testnet', { recipient: bobMeta, amountYocto: parseNear('0.05') })).rejects.toSatisfy((e) => isPerdeError(e, 'INSUFFICIENT_BALANCE'));
    expect(poor.calls).toHaveLength(0);
  });

  it('a wrong bond is rejected by the DAO and surfaces as TX_FAILED', async () => {
    const f = fakeDao();
    const input = buildStealthPaymentProposal({ contractId: PERDE, announceFee: FEE, payments: { ...deriveStealth(bobMeta), amountYocto: MIN } });
    await expect(f.dao.addProposal(f.signer, 'carol.testnet', input, BOND + 1n)).rejects.toSatisfy((e) => isPerdeError(e, 'TX_FAILED'));
    const ok = await f.dao.addProposal(f.signer, 'carol.testnet', input);
    expect(ok.bondYocto).toBe(BOND);
  });

  it('vote sends act_proposal {id, action, proposal kind} and reports execution', async () => {
    const f = fakeDao();
    const p = await f.dao.proposeStealthPayment(f.signer, 'carol.testnet', { recipient: bobMeta, amountYocto: parseNear('0.05') });
    const v = await f.dao.vote(f.signer, 'dave.testnet', p.proposalId, 'approve', { memo: 'ok' });
    const call = f.calls.at(-1);
    expect(call?.method).toBe('act_proposal');
    expect(call?.args).toEqual({ id: p.proposalId, action: 'VoteApprove', proposal: p.proposal.kind, memo: 'ok' });
    expect(call?.gas).toBe(tgas(80)); // 30 Tgas send + 10 Tgas callback + 40 Tgas act_proposal itself
    expect(actProposalGas('Vote')).toBe(tgas(50));
    expect(actProposalGas({ FunctionCall: { receiver_id: PERDE, actions: Array(20).fill({ gas: tgas(15).toString() }) } })).toBe(tgas(300));
    expect(call?.deposit).toBe(0n);
    expect(v).toMatchObject({ action: 'VoteApprove', status: 'Approved', executed: true, failedReceipts: [] });

    const p2 = await f.dao.proposeStealthPayment(f.signer, 'carol.testnet', { recipient: bobMeta, amountYocto: parseNear('0.05') });
    const r = await f.dao.vote(f.signer, 'dave.testnet', p2.proposalId, 'reject');
    expect(f.calls.at(-1)?.args).toEqual({ id: p2.proposalId, action: 'VoteReject', proposal: p2.proposal.kind });
    expect(r).toMatchObject({ status: 'Rejected', executed: false });
  });

  it('views: balance, proposals, last id, describe()', async () => {
    const f = fakeDao();
    await f.dao.proposeStealthPayment(f.signer, 'carol.testnet', { recipient: bobMeta, amountYocto: parseNear('0.05') });
    expect(await f.dao.getBalance()).toEqual({ total: parseNear('6'), storageLocked: parseNear('5.41'), available: parseNear('3') });
    expect(await f.dao.getLastProposalId()).toBe(1);
    const list = await f.dao.getProposals(0, 10);
    expect(list).toHaveLength(1);
    expect((await f.dao.getPolicy()).proposal_bond).toBe(BOND.toString());
    const d = await f.dao.describe(await f.dao.getProposal(0));
    expect(d).toMatchObject({ type: 'perde-payment', proposer: 'carol.testnet', status: 'InProgress', totalAmountYocto: parseNear('0.05') });
    expect(SputnikDao.daoIdFor('perde-demo')).toBe('perde-demo.sputnikv2.testnet');
  });
});

describe('read-after-write lag (regression: demo step 8 "undefined is not iterable")', () => {
  it('a view panic in the legacy `result.error` shape is a typed RpcError, not a TypeError', async () => {
    const { fetch } = mockFetch(() => legacyViewPanic('ERR_NO_PROPOSAL'));
    const rpc = new NearRpc({ urls: ['https://rpc.test'], fetch });
    const err: unknown = await rpc.viewFunction(DAO, 'get_proposal', { id: 6 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect(err).not.toBeInstanceOf(TypeError);
    expect((err as RpcError).causeName).toBe('CONTRACT_EXECUTION_ERROR');
    expect((err as RpcError).message).toContain('ERR_NO_PROPOSAL');
    expect(isReadLagError(err)).toBe(true);

    // same legacy shape for a missing access key (was "Cannot convert undefined to a BigInt" in the demo with a wrong key)
    const noKey = mockFetch(() =>
      jsonResponse({ jsonrpc: '2.0', id: 1, result: { block_hash: 'h', block_height: 1, error: 'access key ed25519:abc does not exist while viewing', logs: [] } }),
    );
    const keyErr: unknown = await new NearRpc({ urls: ['https://rpc.test'], fetch: noKey.fetch }).getAccessKey('alice.testnet', 'ed25519:abc').catch((e: unknown) => e);
    expect(keyErr).toBeInstanceOf(RpcError);
    expect((keyErr as RpcError).causeName).toBe('UNKNOWN_ACCESS_KEY');
    const badNonce = mockFetch(() => jsonResponse({ jsonrpc: '2.0', id: 1, result: { permission: 'FullAccess', block_hash: 'h', block_height: 1 } }));
    await expect(new NearRpc({ urls: ['https://rpc.test'], fetch: badNonce.fetch }).getAccessKey('alice.testnet', 'ed25519:abc')).rejects.toSatisfy((e) => isPerdeError(e, 'RPC_ERROR'));

    const odd = mockFetch(() => jsonResponse({ jsonrpc: '2.0', id: 1, result: { logs: [] } }));
    await expect(new NearRpc({ urls: ['https://rpc.test'], fetch: odd.fetch }).viewFunction(DAO, 'get_policy')).rejects.toSatisfy((e) => isPerdeError(e, 'RPC_ERROR'));
  });

  it('propose → describe → vote succeeds when the node lags behind every write', async () => {
    const f = fakeDao({ lag: 3 });
    const p = await f.dao.proposeStealthPayment(f.signer, 'carol.testnet', { recipient: bobMeta, amountYocto: parseNear('0.05') });
    const visible = await f.dao.waitForProposal(p.proposalId);
    expect(visible.kind).toEqual(p.proposal.kind);
    const v = await f.dao.vote(f.signer, 'dave.testnet', p.proposalId, 'approve');
    expect(v).toMatchObject({ status: 'Approved', executed: true, failedReceipts: [] });
    expect(f.stats.staleServed).toBeGreaterThanOrEqual(6); // ERR_NO_PROPOSAL x3 after add, stale InProgress x3 after vote
  }, 15_000);

  it('pollUntil retries lag errors, gives up with a typed error, and rethrows other errors', async () => {
    let n = 0;
    const lagging = () => {
      n++;
      if (n < 3) return Promise.reject(new RpcError('lag', 'HANDLER_ERROR', 'CONTRACT_EXECUTION_ERROR', {}));
      return Promise.resolve(n);
    };
    expect(await pollUntil(lagging, (x) => x >= 4, { intervalMs: 1 })).toBe(4);
    await expect(pollUntil(() => Promise.resolve(0), (x) => x > 0, { timeoutMs: 20, intervalMs: 5, what: 'x' })).rejects.toSatisfy((e) => isPerdeError(e, 'RPC_ERROR'));
    await expect(pollUntil(() => Promise.reject(new TypeError('boom')), () => true, { intervalMs: 1 })).rejects.toBeInstanceOf(TypeError);
  });

  it('an incomplete transaction outcome is polled via `tx`, and parseOutcome rejects it with a PerdeError', async () => {
    expect(() => parseOutcome({ final_execution_status: 'INCLUDED' } as never)).toThrow(/incomplete transaction outcome/);
    expect(isCompleteOutcome({ final_execution_status: 'NONE' })).toBe(false);
    const f = fakeDao();
    // Wrap the fake: the first send_tx answers with only {final_execution_status}, `tx` returns the real outcome.
    let held: unknown;
    const { fetch } = mockFetch(async (url, body, init) => {
      const { method } = body as { method: string };
      if (method === 'send_tx') {
        held = await (await f.fetch(url, init)).json();
        return jsonResponse({ jsonrpc: '2.0', id: 1, result: { final_execution_status: 'INCLUDED' } });
      }
      if (method === 'tx') return jsonResponse(held);
      return f.fetch(url, init);
    });
    const dao = new SputnikDao({ network: 'testnet', daoId: DAO, perdeContractId: PERDE, rpcUrls: ['https://rpc.test'], fetch });
    const p = await dao.proposeStealthPayment(f.signer, 'carol.testnet', { recipient: bobMeta, amountYocto: parseNear('0.05') });
    expect(p.proposalId).toBe(0);
  }, 15_000);
});
