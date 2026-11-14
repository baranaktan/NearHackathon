/**
 * PREVIEW ONLY — sample values so every screen can be rendered before the
 * hooks are wired to @perde/core and testnet. Random keys/hashes, no real
 * accounts or balances. Delete this folder after wiring.
 */
import type { Identity } from '../features/receive/types';
import type { FoundPayment } from '../features/inbox/types';
import type { Asset, Invoice } from '../features/invoice/types';
import type { AuditEntry } from '../features/audit/types';
import type { ReceiptSummary, VerifyCheck } from '../features/verify/types';
import type { SendQuote } from '../features/send/types';

const NEAR = (n: string) => {
  const [w = '0', f = ''] = n.split('.');
  return (BigInt(w) * 10n ** 24n + BigInt((f + '0'.repeat(24)).slice(0, 24))).toString();
};

export const fx = {
  NEAR,
  contractId: 'perde-preview.testnet',
  words: ['velvet', 'harbor', 'lantern', 'quiet', 'orbit', 'meadow', 'stage', 'copper', 'whisper', 'ladder', 'autumn', 'ribbon'],
  identity: {
    metaAddress: 'perde:KiueHztcJDDjak6937JRQKxEJQ5GPiEjk2Y72ESDcQiqmZYmi4wCeiYR16ztLyQAn69h2TXb3bJqVkaJVmErX9UPHxcoY',
    viewingKey: 'perdeview:TbjGULcyGY5Y5aEkfA1dS5ij4uAXxeuHDrw3CnteCPhB4EXqUiZjEKedBygwAL9ANL5H42DNDvcahdUfaM7WcNbyBFufY',
    registeredName: null,
  } satisfies Identity,
  senderAccount: 'perde-demo-sender-7f3k.testnet',
  recipientAccount: 'perde-demo-alice-2m9q.testnet',
  stealth: [
    'f1746fde79b38d7a2ca71e273164a5d4b4e5c13511af89f242409608a1261e84',
    '5ff4bb1485ff8e53004ec8e87908f10308cbf8081b4e59d13f972377836d5b56',
    '500ea30db876973e9ce7c184e864cf3080e0fb02a5fc3bca42f9d908fe7c0bf2',
    'c024efaf5208a4b99861ed5508e0d819208b94f375e7114166878e87295e108d',
    'eb4e1725612e50772332baed7d0d130d68a4236199f7209978874b541a4612dc',
  ] as const,
  ephemeral: '40d3aefc91b5c8fd244648ff0225424f3aaaaf040e480ae3c46d49f05d8832c1',
  txHashes: [
    'HdhLmPvF6fdoAckPPTnMby1RUUW3CWM7bWYMQfuavJZn',
    'J6dbJak3dYPASyiEsEnD1MxKe98RiaR4TSGLMbGrByvp',
    '5PK8jckH8U6af9qfCDKULbjRdC8GZPaFKuKAYp8JVoQL',
    'DqfPvGQPHDu6HWx6hBD4yq8KXQhN1798oXicis5URe9d',
  ] as const,
};

export const fxQuote: SendQuote = {
  recipientLabel: fx.recipientAccount,
  metaAddress: fx.identity.metaAddress,
  stealthAccount: fx.stealth[0],
  ephemeralPk: fx.ephemeral,
  amountYocto: NEAR('2.5'),
  announceFeeYocto: NEAR('0.002'),
  totalYocto: NEAR('2.502'),
};

export const fxReceipt =
  'perdereceipt:' +
  btoa(JSON.stringify({ v: 1, meta: fx.identity.metaAddress, r: fx.ephemeral, stealth: fx.stealth[0], tx: fx.txHashes[0] }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const day = 86_400_000;
const base = Date.UTC(2026, 10, 14, 9, 30);

export const fxPayments: FoundPayment[] = [
  {
    id: 'p1',
    stealthAccount: fx.stealth[0],
    amountYocto: NEAR('2.5'),
    balanceYocto: NEAR('2.5'),
    timestampMs: base - 40 * 60_000,
    announcementIndex: 41,
    source: 'announcement',
    claim: { status: 'unclaimed' },
  },
  {
    id: 'p2',
    stealthAccount: fx.stealth[1],
    amountYocto: NEAR('10'),
    balanceYocto: NEAR('10'),
    timestampMs: base - 3 * 3_600_000,
    announcementIndex: 37,
    source: 'announcement',
    claim: { status: 'unclaimed' },
  },
  {
    id: 'p3',
    stealthAccount: fx.stealth[2],
    amountYocto: NEAR('0.75'),
    balanceYocto: NEAR('0.75'),
    timestampMs: base - day - 2 * 3_600_000,
    announcementIndex: null,
    source: 'invoice',
    claim: { status: 'unclaimed' },
  },
  {
    id: 'p4',
    stealthAccount: fx.stealth[3],
    amountYocto: NEAR('5'),
    balanceYocto: '0',
    timestampMs: base - 2 * day,
    announcementIndex: 22,
    source: 'announcement',
    claim: { status: 'claimed', destination: 'perde-demo-alice-2m9q.testnet', txHash: fx.txHashes[2], claimedYocto: NEAR('4.9995') },
  },
];

export const fxAssets: [Asset, ...Asset[]] = [
  { id: 'preview:usdc-eth', symbol: 'USDC', chain: 'Ethereum', name: 'USD Coin' },
  { id: 'preview:eth-eth', symbol: 'ETH', chain: 'Ethereum', name: 'Ether' },
  { id: 'preview:btc', symbol: 'BTC', chain: 'Bitcoin', name: 'Bitcoin' },
  { id: 'preview:sol', symbol: 'SOL', chain: 'Solana', name: 'Solana' },
  { id: 'preview:eth-arb', symbol: 'ETH', chain: 'Arbitrum', name: 'Ether' },
  { id: 'preview:usdc-base', symbol: 'USDC', chain: 'Base', name: 'USD Coin' },
  { id: 'preview:usdt-tron', symbol: 'USDT', chain: 'Tron', name: 'Tether' },
];

export const fxInvoices: [Invoice, Invoice] = [
  {
    index: 2,
    stealthAccount: fx.stealth[4],
    payLink: `https://perde.example/#/pay?to=${fx.stealth[4]}&amount=12`,
    amountYocto: NEAR('12'),
    memo: 'Design retainer — November',
    createdAtMs: base - 20 * 60_000,
    status: 'open',
    receivedYocto: '0',
  },
  {
    index: 1,
    stealthAccount: fx.stealth[2],
    payLink: `https://perde.example/#/pay?to=${fx.stealth[2]}`,
    amountYocto: null,
    memo: 'Tip jar',
    createdAtMs: base - day - 5 * 3_600_000,
    status: 'paid',
    receivedYocto: NEAR('0.75'),
  },
];

export const fxAuditEntries: AuditEntry[] = fxPayments
  .filter((p) => p.announcementIndex !== null)
  .map((p) => ({
    stealthAccount: p.stealthAccount,
    amountYocto: p.amountYocto,
    balanceYocto: p.balanceYocto,
    timestampMs: p.timestampMs,
    announcementIndex: p.announcementIndex ?? 0,
    spent: p.balanceYocto === '0',
  }));

export const fxReceiptSummary: ReceiptSummary = {
  metaAddress: fx.identity.metaAddress,
  stealthAccount: fx.stealth[0],
  amountYocto: NEAR('2.5'),
  txHash: fx.txHashes[0],
  timestampMs: base - 40 * 60_000,
};

export const fxChecks = (fail = false): VerifyCheck[] => [
  { id: 'parse', label: 'Receipt is well-formed', detail: 'perdereceipt v1 · base64url JSON', status: 'pass' },
  { id: 'R', label: 'Ephemeral key matches the secret', detail: 'R = r·G  →  40d3ae…8832c1', status: 'pass' },
  {
    id: 'P',
    label: 'Stealth account derives from the meta-address',
    detail: 'P = K_spend + H(r·K_view)·G  →  f1746f…261e84',
    status: fail ? 'fail' : 'pass',
  },
  {
    id: 'ann',
    label: 'Announcement exists on-chain',
    detail: fail ? 'skipped — derivation failed' : 'announcement #41 · same R and account',
    status: fail ? 'skipped' : 'pass',
  },
  { id: 'tx', label: 'Transaction succeeded', detail: fail ? 'skipped' : 'HdhLmP…uavJZn · status SuccessValue', status: fail ? 'skipped' : 'pass' },
];

export const fxPayrollCsv = `recipient,amount,memo
${fx.recipientAccount},12.5,November
perde:KiueHztcJDDjak6937JRQKxEJQ5GPiEjk2Y72ESDcQiqmZYmi4wCeiYR16ztLyQAn69h2TXb3bJqVkaJVmErX9UPHxcoY,8,Contractor
bob-demo.testnet,4.25,Design
not a recipient,3,Typo
carol-demo.testnet,-1,Negative`;
