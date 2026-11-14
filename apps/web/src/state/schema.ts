/**
 * Everything Perde keeps in this browser, under ONE versioned localStorage
 * key. Testnet prototype: keys are stored unencrypted (the Settings page says
 * so). Loading is defensive: unknown or malformed entries are dropped instead
 * of crashing the app.
 */

export const STORAGE_KEY = 'perde:state';
export const STATE_VERSION = 1;

export interface WalletRecord {
  accountId: string;
  /** "ed25519:…" — full-access key of a throwaway testnet account. */
  secretKey: string;
  source: 'faucet' | 'import';
  addedAtMs: number;
}

export interface IdentityRecord {
  /** 12-word BIP-39 phrase. */
  mnemonic: string;
  /** The person confirmed they stored the phrase. */
  confirmed: boolean;
  createdAtMs: number;
}

export interface InvoiceRecord {
  index: number;
  /** Requested amount; null = any amount. */
  amountYocto: string | null;
  note: string;
  createdAtMs: number;
}

export interface SentRecord {
  id: string;
  kind: 'send' | 'payroll' | 'invoice';
  txHash: string;
  atMs: number;
  senderId: string;
  /** What the sender typed/saw: a name, a meta-address or an invoice account. */
  recipientLabel: string;
  /** Meta-address the stealth account was derived from (null for plain invoice transfers). */
  metaAddress: string | null;
  stealthAccount: string;
  amountYocto: string;
  /** Announcement fee paid on top (0 for invoice transfers). */
  feeYocto: string;
  receipt: string | null;
  announcementIndex: number | null;
  memo: string;
  /** Payroll: which transaction of a chunked batch. */
  batch: { tx: number; of: number } | null;
}

export interface ClaimRecord {
  stealthAccount: string;
  txHash: string;
  destination: string;
  amountYocto: string;
  mode: 'transfer' | 'deleteAccount';
  atMs: number;
}

export interface CachedPayment {
  index: number;
  stealthAccount: string;
  ephemeralPk: string;
  viewTag: number;
  amountYocto: string;
  timestampMs: number;
}

export interface ScanCache {
  /** Meta-address the cache belongs to (a different identity starts over). */
  metaAddress: string;
  /** Next announcement index to read. */
  nextIndex: number;
  payments: CachedPayment[];
  scannedAtMs: number;
}

export interface DemoProgress {
  dismissed: boolean;
  chainViewSeen: boolean;
  quoteSeen: boolean;
  /** A DAO payout proposal was approved and executed from this browser. */
  daoPaid: boolean;
}

export interface PersistedState {
  v: typeof STATE_VERSION;
  wallet: WalletRecord | null;
  identity: IdentityRecord | null;
  invoices: InvoiceRecord[];
  nextInvoiceIndex: number;
  sent: SentRecord[];
  claims: Record<string, ClaimRecord>;
  scan: ScanCache | null;
  demo: DemoProgress;
}

export function initialState(): PersistedState {
  return {
    v: STATE_VERSION,
    wallet: null,
    identity: null,
    invoices: [],
    nextInvoiceIndex: 0,
    sent: [],
    claims: {},
    scan: null,
    demo: { dismissed: false, chainViewSeen: false, quoteSeen: false, daoPaid: false },
  };
}

/* ------------------------------ validation helpers ------------------------------ */

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): x is string => typeof x === 'string';
const int = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const yocto = (x: unknown): x is string => str(x) && /^\d{1,40}$/.test(x);
const hex64 = (x: unknown): x is string => str(x) && /^[0-9a-f]{64}$/.test(x);
const accountId = (x: unknown): x is string => str(x) && x.length >= 2 && x.length <= 64 && /^[a-z0-9._-]+$/.test(x);

function wallet(x: unknown): WalletRecord | null {
  if (!isObj(x) || !accountId(x.accountId) || !str(x.secretKey) || !x.secretKey.startsWith('ed25519:')) return null;
  return {
    accountId: x.accountId,
    secretKey: x.secretKey,
    source: x.source === 'faucet' ? 'faucet' : 'import',
    addedAtMs: int(x.addedAtMs) ? x.addedAtMs : 0,
  };
}

function identity(x: unknown): IdentityRecord | null {
  if (!isObj(x) || !str(x.mnemonic)) return null;
  const words = x.mnemonic.trim().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) return null;
  return { mnemonic: words.join(' '), confirmed: x.confirmed === true, createdAtMs: int(x.createdAtMs) ? x.createdAtMs : 0 };
}

function invoice(x: unknown): InvoiceRecord | null {
  if (!isObj(x) || !int(x.index)) return null;
  return {
    index: x.index,
    amountYocto: yocto(x.amountYocto) ? x.amountYocto : null,
    note: str(x.note) ? x.note.slice(0, 140) : '',
    createdAtMs: int(x.createdAtMs) ? x.createdAtMs : 0,
  };
}

function sent(x: unknown): SentRecord | null {
  if (!isObj(x) || !str(x.id) || !str(x.txHash) || !hex64(x.stealthAccount) || !yocto(x.amountYocto)) return null;
  const kind = x.kind === 'payroll' || x.kind === 'invoice' ? x.kind : 'send';
  const batch = isObj(x.batch) && int(x.batch.tx) && int(x.batch.of) ? { tx: x.batch.tx, of: x.batch.of } : null;
  return {
    id: x.id,
    kind,
    txHash: x.txHash,
    atMs: int(x.atMs) ? x.atMs : 0,
    senderId: str(x.senderId) ? x.senderId : '',
    recipientLabel: str(x.recipientLabel) ? x.recipientLabel : '',
    metaAddress: str(x.metaAddress) ? x.metaAddress : null,
    stealthAccount: x.stealthAccount,
    amountYocto: x.amountYocto,
    feeYocto: yocto(x.feeYocto) ? x.feeYocto : '0',
    receipt: str(x.receipt) ? x.receipt : null,
    announcementIndex: int(x.announcementIndex) ? x.announcementIndex : null,
    memo: str(x.memo) ? x.memo : '',
    batch,
  };
}

function claim(x: unknown): ClaimRecord | null {
  if (!isObj(x) || !hex64(x.stealthAccount) || !str(x.txHash) || !accountId(x.destination) || !yocto(x.amountYocto)) return null;
  return {
    stealthAccount: x.stealthAccount,
    txHash: x.txHash,
    destination: x.destination,
    amountYocto: x.amountYocto,
    mode: x.mode === 'deleteAccount' ? 'deleteAccount' : 'transfer',
    atMs: int(x.atMs) ? x.atMs : 0,
  };
}

function cachedPayment(x: unknown): CachedPayment | null {
  if (!isObj(x) || !int(x.index) || !hex64(x.stealthAccount) || !hex64(x.ephemeralPk) || !int(x.viewTag) || !yocto(x.amountYocto)) return null;
  return {
    index: x.index,
    stealthAccount: x.stealthAccount,
    ephemeralPk: x.ephemeralPk,
    viewTag: x.viewTag,
    amountYocto: x.amountYocto,
    timestampMs: int(x.timestampMs) ? x.timestampMs : 0,
  };
}

function scan(x: unknown): ScanCache | null {
  if (!isObj(x) || !str(x.metaAddress) || !int(x.nextIndex) || !Array.isArray(x.payments)) return null;
  return {
    metaAddress: x.metaAddress,
    nextIndex: x.nextIndex,
    payments: x.payments.map(cachedPayment).filter((p): p is CachedPayment => p !== null),
    scannedAtMs: int(x.scannedAtMs) ? x.scannedAtMs : 0,
  };
}

function list<T>(x: unknown, f: (v: unknown) => T | null): T[] {
  return Array.isArray(x) ? x.map(f).filter((v): v is T => v !== null) : [];
}

/**
 * Parse whatever is stored into the current shape. Unknown versions (written
 * by a newer build) and garbage give a fresh state; individual malformed
 * records are dropped.
 */
export function migrate(raw: unknown): PersistedState {
  if (!isObj(raw) || raw.v !== STATE_VERSION) return initialState();
  const invoices = list(raw.invoices, invoice);
  const maxIndex = invoices.reduce((m, i) => Math.max(m, i.index + 1), 0);
  const claims: Record<string, ClaimRecord> = {};
  if (isObj(raw.claims)) {
    for (const v of Object.values(raw.claims)) {
      const c = claim(v);
      if (c) claims[c.stealthAccount] = c;
    }
  }
  const demo = isObj(raw.demo) ? raw.demo : {};
  return {
    v: STATE_VERSION,
    wallet: wallet(raw.wallet),
    identity: identity(raw.identity),
    invoices,
    nextInvoiceIndex: Math.max(int(raw.nextInvoiceIndex) ? raw.nextInvoiceIndex : 0, maxIndex),
    sent: list(raw.sent, sent),
    claims,
    scan: scan(raw.scan),
    demo: { dismissed: demo.dismissed === true, chainViewSeen: demo.chainViewSeen === true, quoteSeen: demo.quoteSeen === true, daoPaid: demo.daoPaid === true },
  };
}
