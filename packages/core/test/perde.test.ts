import { describe, expect, it } from 'vitest';
import {
  deriveInvoice,
  encodeMetaAddress,
  encodeViewingKey,
  estimateClaimFee,
  FALLBACK_FEE_CONFIG,
  generateMnemonic,
  keysFromMnemonic,
  PerdeClient,
  SeedSigner,
  verifyReceipt,
} from '../src/index.js';
import { ANNOUNCE_FEE, BURN_PER_TX, fakeChain, MIN_AMOUNT } from './fakeChain.js';

const NEAR = 10n ** 24n;

function setup() {
  const chain = fakeChain('perde.testnet');
  const client = new PerdeClient({ network: 'testnet', contractId: 'perde.testnet', rpcUrls: ['https://rpc.fake'], fetch: chain.fetch });
  const sender = SeedSigner.generate();
  chain.addAccount('sender.testnet', sender.publicKeyString, 100n * NEAR);
  const destination = SeedSigner.generate();
  chain.addAccount('dest.testnet', destination.publicKeyString, 1n * NEAR);
  return { chain, client, sender };
}

describe('PerdeClient against a simulated chain', () => {
  it('send → scan → claim (transfer sweep) end to end', async () => {
    const { chain, client, sender } = setup();
    const alice = keysFromMnemonic(generateMnemonic());
    const meta = encodeMetaAddress(alice);

    const sent = await client.send(sender, 'sender.testnet', meta, NEAR);
    expect(sent.announcementIndex).toBe(0);
    expect(chain.submitted[0]?.actions[0]).toMatchObject({ kind: 'functionCall', methodName: 'send', deposit: NEAR + ANNOUNCE_FEE });
    expect(verifyReceipt(sent.receipt).valid).toBe(true);
    expect(sent.explorerUrl).toBe(`https://testnet.nearblocks.io/txns/${sent.txHash}`);

    // Noise from other senders.
    const bob = keysFromMnemonic(generateMnemonic());
    await client.send(sender, 'sender.testnet', encodeMetaAddress(bob), 2n * NEAR);

    const scan = await client.scan(encodeViewingKey(alice));
    expect(scan.scanned).toBe(2);
    expect(scan.nextIndex).toBe(2);
    expect(scan.payments).toHaveLength(1);
    const payment = scan.payments[0];
    if (payment === undefined) throw new Error('no payment');
    expect(payment.stealthAccountId).toBe(sent.stealthAccountId);
    expect(payment.balance).toBe(NEAR);
    expect((await client.scan(alice, { fromIndex: 2 })).payments).toHaveLength(0);

    const claim = await client.claim(alice, payment, 'dest.testnet');
    const tx = chain.submitted.at(-1);
    expect(tx?.signatureValid).toBe(true);
    expect(tx?.signerId).toBe(sent.stealthAccountId);
    expect(tx?.receiverId).toBe('dest.testnet');
    const expectedFee = estimateClaimFee({ config: FALLBACK_FEE_CONFIG, gasPrice: 100_000_000n, mode: 'transfer', createsDestination: false });
    expect(claim.fee).toEqual(expectedFee);
    expect(claim.amountYocto).toBe(NEAR - expectedFee.reserve);
    expect(chain.balances.get('dest.testnet')).toBe(NEAR + NEAR - expectedFee.reserve);
    expect(chain.balances.get(sent.stealthAccountId)).toBe(expectedFee.reserve - BURN_PER_TX);
  });

  it('claim in deleteAccount mode moves everything and needs an existing destination', async () => {
    const { chain, client, sender } = setup();
    const alice = keysFromMnemonic(generateMnemonic());
    const sent = await client.send(sender, 'sender.testnet', encodeMetaAddress(alice), NEAR);
    await expect(client.claim(alice, sent, 'nobody.testnet', { mode: 'deleteAccount' })).rejects.toMatchObject({ code: 'DESTINATION_NOT_FOUND' });
    await expect(client.claim(alice, sent, 'nobody.testnet')).rejects.toMatchObject({ code: 'DESTINATION_NOT_FOUND' });
    const res = await client.claim(alice, sent, 'dest.testnet', { mode: 'deleteAccount' });
    expect(res.mode).toBe('deleteAccount');
    expect(chain.submitted.at(-1)).toMatchObject({ signerId: sent.stealthAccountId, receiverId: sent.stealthAccountId, signatureValid: true });
    expect(chain.balances.has(sent.stealthAccountId)).toBe(false);
    expect(chain.balances.get('dest.testnet')).toBe(2n * NEAR - BURN_PER_TX);
  });

  it('claim accepts a fresh implicit destination and rejects insufficient balances', async () => {
    const { chain, client, sender } = setup();
    const alice = keysFromMnemonic(generateMnemonic());
    const sent = await client.send(sender, 'sender.testnet', encodeMetaAddress(alice), NEAR / 10n);
    await expect(client.claim(alice, sent, 'ab'.repeat(32), { amountYocto: NEAR / 10n })).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    const res = await client.claim(alice, sent, 'ab'.repeat(32));
    expect(res.fee.reserve).toBeGreaterThan(FALLBACK_FEE_CONFIG.accountCreationCharge ?? 0n);
    expect(chain.balances.get('ab'.repeat(32))).toBe(res.amountYocto);
    const eve = keysFromMnemonic(generateMnemonic());
    await expect(client.claim(eve, sent, 'dest.testnet')).rejects.toMatchObject({ code: 'KEY_MISMATCH' });
  });

  it('register + send by account id; unregistered recipients are rejected', async () => {
    const { chain, client, sender } = setup();
    const alice = keysFromMnemonic(generateMnemonic());
    await client.register(sender, 'sender.testnet', encodeMetaAddress(alice));
    expect(chain.submitted[0]?.actions[0]).toMatchObject({ methodName: 'register', args: { meta_address: encodeMetaAddress(alice) } });
    expect(await client.getMetaAddress('sender.testnet')).toBe(encodeMetaAddress(alice));
    expect(await client.getMetaAddress('dest.testnet')).toBeNull();
    const sent = await client.send(sender, 'sender.testnet', 'sender.testnet', NEAR);
    expect((await client.scan(alice)).payments[0]?.stealthAccountId).toBe(sent.stealthAccountId);
    await expect(client.send(sender, 'sender.testnet', 'dest.testnet', NEAR)).rejects.toMatchObject({ code: 'RECIPIENT_NOT_REGISTERED' });
    await expect(client.send(sender, 'sender.testnet', encodeMetaAddress(alice), MIN_AMOUNT - 1n)).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
  });

  it('sendBatch puts N send actions in ONE transaction', async () => {
    const { chain, client, sender } = setup();
    const people = Array.from({ length: 5 }, () => keysFromMnemonic(generateMnemonic()));
    const before = chain.submitted.length;
    const res = await client.sendBatch(
      sender,
      'sender.testnet',
      people.map((k, i) => ({ to: encodeMetaAddress(k), amountYocto: BigInt(i + 1) * NEAR })),
    );
    expect(chain.submitted.length - before).toBe(1);
    const tx = chain.submitted.at(-1);
    expect(tx?.actions).toHaveLength(5);
    expect(tx?.actions.every((a) => a.methodName === 'send' && a.gas === 20_000_000_000_000n)).toBe(true);
    expect(res.totalDeposit).toBe(15n * NEAR + 5n * ANNOUNCE_FEE);
    for (const [i, k] of people.entries()) {
      const found = (await client.scan(k)).payments;
      expect(found).toHaveLength(1);
      expect(found[0]?.amount).toBe(BigInt(i + 1) * NEAR);
      expect(verifyReceipt(res.items[i]?.receipt ?? '').valid).toBe(true);
    }
    expect(client.maxBatchSize).toBe(15);
    const tooMany = Array.from({ length: 16 }, () => ({ to: res.items[0]?.metaAddress ?? '', amountYocto: NEAR }));
    await expect(client.sendBatch(sender, 'sender.testnet', tooMany)).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
  });

  it('fetchAnnouncements pages with a cursor', async () => {
    const { client, chain } = setup();
    for (let i = 0; i < 450; i++) {
      chain.announcements.push({ index: i, stealth_account: 'ab'.repeat(32), ephemeral_pk: 'cd'.repeat(32), view_tag: 1, amount: '1', timestamp_ms: i });
    }
    const p1 = await client.fetchAnnouncements();
    expect(p1.announcements).toHaveLength(200);
    expect(p1.hasMore).toBe(true);
    const p3 = await client.fetchAnnouncements({ fromIndex: 400 });
    expect(p3.announcements).toHaveLength(50);
    expect(p3.hasMore).toBe(false);
    expect(p3.nextIndex).toBe(450);
    const scan = await client.scan(keysFromMnemonic(generateMnemonic()), { fromIndex: 100 });
    expect(scan.scanned).toBe(350);
    expect(scan.nextIndex).toBe(450);
    expect(await client.announcementCount()).toBe(450);
  });

  it('scanInvoices finds funded invoice accounts with a gap limit and claims them', async () => {
    const { client, chain } = setup();
    const alice = keysFromMnemonic(generateMnemonic());
    for (const i of [0, 3, 22]) chain.fund(deriveInvoice(alice, i).stealthAccountId, BigInt(i + 1) * NEAR);
    chain.fund(deriveInvoice(alice, 60).stealthAccountId, NEAR);
    const found = await client.scanInvoices(encodeViewingKey(alice), { gapLimit: 20 });
    expect(found.map((f) => f.index)).toEqual([0, 3, 22]);
    expect(found[2]?.balance).toBe(23n * NEAR);
    const res = await client.claim(alice, { invoiceIndex: 3 }, 'dest.testnet');
    expect(res.stealthAccountId).toBe(deriveInvoice(alice, 3).stealthAccountId);
    expect(chain.submitted.at(-1)?.signatureValid).toBe(true);
  });

  it('verifyReceipt checks the announcement on chain', async () => {
    const { client, sender } = setup();
    const alice = keysFromMnemonic(generateMnemonic());
    const sent = await client.send(sender, 'sender.testnet', encodeMetaAddress(alice), NEAR);
    const v = await client.verifyReceipt(sent.receipt);
    expect(v.valid).toBe(true);
    expect(v.announced).toBe(true);
    expect(v.balance).toBe(NEAR);
    expect(v.announcement?.index).toBe(0);
  });

  it('fee math: transfer reserve covers creation charge, deleteAccount reserves nothing', () => {
    const base = { config: FALLBACK_FEE_CONFIG, gasPrice: 100_000_000n };
    const t = estimateClaimFee({ ...base, mode: 'transfer', createsDestination: false });
    expect(t.gas).toBe(446_365_125_000n);
    expect(t.reservePrice).toBe(1_000_000_000n);
    expect(t.expectedFee).toBe(44_636_512_500_000_000_000n);
    expect(t.reserve).toBe(669_547_687_500_000_000_000n);
    const c = estimateClaimFee({ ...base, mode: 'transfer', createsDestination: true });
    expect(c.reserve - (FALLBACK_FEE_CONFIG.accountCreationCharge ?? 0n)).toBeGreaterThan(t.reserve);
    const d = estimateClaimFee({ ...base, mode: 'deleteAccount', createsDestination: false });
    expect(d.reserve).toBe(0n);
    expect(d.gas).toBe(511_097_000_000n);
  });
});
