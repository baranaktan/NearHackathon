import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  deleteAccount,
  describeProposal,
  encodeMetaAddress,
  encodeViewingKey,
  explorerAccountUrl,
  explorerTxUrl,
  formatNear,
  generateMnemonic,
  implicitAccountId,
  keysFromMnemonic,
  NearRpc,
  NETWORKS,
  parseNear,
  PerdeClient,
  SeedSigner,
  sendActions,
  SputnikDao,
  transfer,
} from '../src/index.js';
import { getFunder, waitFor } from './testnetFunder.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..');
const EVIDENCE = join(ROOT, 'evidence', 'dao-private-payment.md');
const DEPLOYMENT = join(ROOT, 'deployments', 'testnet.json');

interface Deployment {
  contractId: string;
  dao?: { daoId: string; factory: string; proposalBond: string; createdTx?: string; contractVersion?: string };
}
const deployment: Deployment | undefined = existsSync(DEPLOYMENT) ? (JSON.parse(readFileSync(DEPLOYMENT, 'utf8')) as Deployment) : undefined;
const daoInfo = deployment?.dao;

const rpc = new NearRpc({ urls: NETWORKS.testnet.rpcUrls });
const near = (y: bigint): string => `${formatNear(y)} NEAR`;
const link = (hash: string): string => `[\`${hash}\`](${explorerTxUrl('testnet', hash)})`;
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 2500));

describe.skipIf(daoInfo === undefined || deployment === undefined)('testnet: private payment from a SputnikDAO treasury', () => {
  it('propose perde.send from the DAO → an outsider approves → recipient scans and claims', async () => {
    if (deployment === undefined || daoInfo === undefined) return;
    const funder = await getFunder(rpc);
    const dao = new SputnikDao({ network: 'testnet', daoId: daoInfo.daoId, perdeContractId: deployment.contractId, rpcUrls: NETWORKS.testnet.rpcUrls });
    const perde = dao.perde as PerdeClient;
    const [policy, version, config, balanceBefore, startIndex] = await Promise.all([dao.getPolicy(), dao.getVersion(), perde.getConfig(), dao.getBalance(), perde.announcementCount()]);

    // Recipient: a brand-new meta-address that exists only in this process.
    const bob = keysFromMnemonic(generateMnemonic());
    const meta = encodeMetaAddress(bob);
    const amount = parseNear('0.05');

    // 1. Propose (the funder plays "any community member").
    const proposed = await dao.proposeStealthPayment(funder.signer, funder.accountId, { recipient: meta, amountYocto: amount });
    expect(proposed.bondYocto).toBe(BigInt(policy.proposal_bond));
    const onChain = await dao.waitForProposal(proposed.proposalId);
    expect(onChain.status).toBe('InProgress');
    const summary = describeProposal(onChain, { contractId: deployment.contractId, announceFee: config.announceFee });
    expect(summary.type).toBe('perde-payment');
    if (summary.type !== 'perde-payment') return;
    expect(summary.payments[0]?.stealthAccountId).toBe(proposed.stealthAccountId);
    expect(summary.totalAmountYocto).toBe(amount);
    expect(JSON.stringify(onChain)).not.toContain(meta);
    expect(await rpc.accountExists(proposed.stealthAccountId)).toBe(false);

    // 2. An outsider approves: a throwaway implicit account with no role in the DAO.
    const voterSigner = SeedSigner.generate();
    const voterId = implicitAccountId(voterSigner.publicKey);
    const fundVoter = await sendActions({ rpc, signer: funder.signer, signerId: funder.accountId, receiverId: voterId, actions: [transfer(parseNear('0.15'))] });
    await waitFor(() => rpc.getBalance(voterId), (b) => b > 0n);
    const vote = await dao.vote(voterSigner, voterId, proposed.proposalId, 'approve', { memo: 'approved by an outsider in the open demo DAO' });
    expect(vote.status).toBe('Approved');
    expect(vote.executed).toBe(true);
    expect(vote.failedReceipts).toEqual([]);
    const sendReceipt = vote.outcome.raw.receipts_outcome.find((r) => r.outcome.executor_id === deployment.contractId);
    const transferReceipt = vote.outcome.raw.receipts_outcome.find((r) => r.outcome.executor_id === proposed.stealthAccountId);
    const bondRefund = vote.outcome.raw.receipts_outcome.find((r) => r.outcome.executor_id === funder.accountId);
    expect(sendReceipt).toBeDefined();
    expect(transferReceipt).toBeDefined();

    // 3. Announcement + stealth balance + the recipient's scan.
    // Every read below follows a write, so it polls (bounded) until an RPC node that has the block answers.
    const page = await waitFor(
      () => perde.fetchAnnouncements({ fromIndex: startIndex }),
      (p) => p.announcements.some((a) => a.stealthAccountId === proposed.stealthAccountId),
    );
    const ann = page.announcements.find((a) => a.stealthAccountId === proposed.stealthAccountId);
    expect(ann?.amount).toBe(amount);
    expect(await waitFor(() => rpc.getBalance(proposed.stealthAccountId), (b) => b > 0n)).toBe(amount);
    const scan = await waitFor(
      () => perde.scan(encodeViewingKey(bob), { fromIndex: startIndex }),
      (s) => s.payments.some((p) => p.stealthAccountId === proposed.stealthAccountId && p.balance === amount),
    );
    expect(scan.payments.map((p) => p.stealthAccountId)).toEqual([proposed.stealthAccountId]);
    const verified = await waitFor(() => perde.verifyReceipt(proposed.receipt), (r) => r.announced);
    expect(verified.valid && verified.announced).toBe(true);
    await settle(); // let the bond refund / storage settle before reading the treasury for the evidence numbers
    const balanceAfter = await dao.getBalance();

    // 4. Claim to the funder (DeleteAccount: whole balance, no dust).
    const payment = scan.payments[0];
    if (payment === undefined) throw new Error('payment not found');
    const claim = await perde.claim(bob, payment, funder.accountId, { mode: 'deleteAccount' });
    expect(claim.outcome.success).toBe(true);
    await waitFor(() => rpc.accountExists(proposed.stealthAccountId), (e) => !e);

    // Clean up the throwaway voter (its balance goes back to the funder).
    const voterLeft = await rpc.getBalance(voterId);
    const cleanup = await sendActions({ rpc, signer: voterSigner, signerId: voterId, receiverId: voterId, actions: [deleteAccount(funder.accountId)] });

    const roles = policy.roles.map((r) => `\`${r.name}\` = \`${JSON.stringify(r.kind)}\` → ${r.permissions.map((p) => `\`${p}\``).join(', ')}`);
    const lines = [
      '# Private payment from a DAO treasury (SputnikDAO v2 + Perde) — live testnet run',
      '',
      `Generated by \`npm run test:testnet\` (packages/core/test/dao.testnet.test.ts) at ${new Date().toISOString()}. No private keys are recorded here; the recipient's 12-word mnemonic existed only in memory.`,
      '',
      '## Setup',
      '',
      `- DAO: [${dao.daoId}](${explorerAccountUrl('testnet', dao.daoId)}) created through the official factory \`${daoInfo.factory}\` (default code \`AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH\`, contract \`version()\` = \`${version}\`)${daoInfo.createdTx ? `, create tx ${link(daoInfo.createdTx)}` : ''}`,
      `- Perde contract: [${deployment.contractId}](${explorerAccountUrl('testnet', deployment.contractId)}), announce fee ${near(config.announceFee)}`,
      `- proposal bond ${near(BigInt(policy.proposal_bond))} (\`add_proposal\` requires exactly this deposit), proposal period ${Number(BigInt(policy.proposal_period) / 1_000_000_000n)} s`,
      '- policy roles:',
      ...roles.map((r) => `  - ${r}`),
      `- default vote policy: \`${JSON.stringify(policy.default_vote_policy)}\` (with a \`Member("0")\` role, one approve vote reaches quorum 1)`,
      `- treasury before: available ${near(balanceBefore.available)} (total ${near(balanceBefore.total)}, storage ${near(balanceBefore.storageLocked)})`,
      '',
      '## Transactions',
      '',
      `1. \`add_proposal\` by ${funder.accountId} (bond attached): ${link(proposed.txHash)} → proposal id **${proposed.proposalId}**`,
      `2. fund a throwaway outsider account \`${voterId}\` (no DAO role) with 0.15 NEAR for gas: ${link(fundVoter.hash)}`,
      `3. \`act_proposal({id: ${proposed.proposalId}, action: "VoteApprove", proposal: <kind>, memo})\` by the outsider — the vote reaches quorum and the DAO executes \`${deployment.contractId}.send\` in the same transaction: ${link(vote.txHash)} (status after: **${vote.status}**, gas burnt ${vote.outcome.gasBurnt})`,
      `   - receipt chain: \`${dao.daoId}\` → \`${deployment.contractId}.send\` (${sendReceipt ? 'success' : 'missing'}) → Transfer creating \`${proposed.stealthAccountId}\`${transferReceipt ? '' : ' (not found)'} → \`on_proposal_callback\`${bondRefund ? ` → bond refund Transfer to ${funder.accountId}` : ' (no bond refund receipt found)'}`,
      `4. recipient claims with the stealth key (DeleteAccount → ${funder.accountId}): ${link(claim.txHash)}`,
      `5. cleanup: outsider account deleted, ${near(voterLeft)} returned: ${link(cleanup.hash)}`,
      '',
      `Treasury after the payment: available ${near(balanceAfter.available)} (spent ${near(balanceBefore.available - balanceAfter.available)} = ${near(amount)} + ${near(config.announceFee)} announce fee + proposal storage).`,
      '',
      '## What a public observer sees',
      '',
      `The proposal, exactly as \`get_proposal({id: ${proposed.proposalId}})\` returns it after execution:`,
      '',
      '```json',
      JSON.stringify(await dao.getProposal(proposed.proposalId), null, 2),
      '```',
      '',
      `Decoded \`args\`: \`${JSON.stringify({ stealth_account: proposed.stealthAccountId, ephemeral_pk: proposed.ephemeralPk, view_tag: proposed.viewTag })}\`.`,
      '',
      `- The DAO paid ${near(amount)} (+ fee) to [${proposed.stealthAccountId}](${explorerAccountUrl('testnet', proposed.stealthAccountId)}), an implicit account that did not exist before this proposal executed and has no history.`,
      `- Announcement #${ann?.index}: \`${JSON.stringify(ann, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))}\`.`,
      '- Nothing in the description, the args, the announcement or the receipts names the recipient or their meta-address. The proposer and the voter are public; the payee is not.',
      '',
      '## What the recipient sees',
      '',
      `- \`PerdeClient.scan(viewingKey, {fromIndex: ${startIndex}})\` scanned ${scan.scanned} announcement(s) and found exactly this payment: stealth account \`${payment.stealthAccountId}\`, balance ${near(payment.balance)}.`,
      `- The proposer kept a sender receipt; \`verifyReceipt\` against the chain: valid=${verified.valid}, announced=${verified.announced} (announcement #${verified.announcement?.index}).`,
      `- The recipient swept it with the stealth scalar (no DAO interaction, no link to their main account except the destination they chose): ${near(claim.balanceBefore)} moved, ${near(claim.tokensBurnt)} burnt.`,
      '',
      '## Caveats (honest)',
      '',
      '- This demo DAO is deliberately open: anyone may propose and approve FunctionCall proposals (public role `Member("0")`, quorum 1), so a visitor can try it. It is for demonstration only. A real DAO keeps its own council policy; Perde needs nothing from the policy except that FunctionCall proposals can be approved.',
      '- The open role is limited to `call` proposals, so outsiders cannot change the policy, upgrade the contract or make Transfer proposals; they could still drain the small testnet treasury with arbitrary FunctionCalls.',
      '- The amount is public (proposal deposit, announcement, stealth balance). Perde hides who was paid, not how much.',
      '- The proposer knows the recipient (they derived the stealth address from the recipient\'s meta-address). Voters and observers do not.',
      '- Timing: the stealth account appears a couple of blocks after the approval vote; with few payments, timing and amount can narrow guesses. If the recipient sweeps to an account linked to their identity, that link is public.',
      '- Contract version: the testnet factory deploys sputnikdao2 `version()` 2.3.1 (factory metadata [3,31], commit 7764926). Its `act_proposal(id, action, memo)` ignores the extra `proposal` argument we send; newer upstream versions require it (`ERR_WRONG_KIND` guard), so the client always includes it.',
    ];
    mkdirSync(dirname(EVIDENCE), { recursive: true });
    writeFileSync(EVIDENCE, lines.join('\n') + '\n');
  });
});
