import { initialState, type ClaimRecord, type DemoProgress, type IdentityRecord, type InvoiceRecord, type PersistedState, type ScanCache, type SentRecord, type WalletRecord } from './schema';

export type Action =
  | { type: 'wallet/set'; wallet: WalletRecord }
  | { type: 'wallet/clear' }
  | { type: 'identity/set'; identity: IdentityRecord }
  | { type: 'identity/confirm' }
  /** Forgets the identity and everything derived from it (invoices, scan cache, claims). */
  | { type: 'identity/clear' }
  | { type: 'invoice/add'; invoice: Omit<InvoiceRecord, 'index'> }
  /** Invoice accounts found on-chain by a discovery scan (e.g. after restoring the phrase in a new browser). */
  | { type: 'invoice/recover'; indices: number[] }
  | { type: 'sent/add'; records: SentRecord[] }
  | { type: 'claim/add'; claim: ClaimRecord }
  | { type: 'scan/set'; scan: ScanCache | null }
  | { type: 'demo/update'; patch: Partial<DemoProgress> }
  | { type: 'reset' }
  /** Replace everything (another tab wrote newer state). */
  | { type: 'hydrate'; state: PersistedState };

/** Most recent first, capped so localStorage stays small. */
const SENT_CAP = 200;

export function reducer(state: PersistedState, action: Action): PersistedState {
  switch (action.type) {
    case 'wallet/set':
      return { ...state, wallet: action.wallet };
    case 'wallet/clear':
      return { ...state, wallet: null };
    case 'identity/set':
      return { ...state, identity: action.identity, invoices: [], nextInvoiceIndex: 0, scan: null, claims: {} };
    case 'identity/confirm':
      return state.identity ? { ...state, identity: { ...state.identity, confirmed: true } } : state;
    case 'identity/clear':
      return { ...state, identity: null, invoices: [], nextInvoiceIndex: 0, scan: null, claims: {} };
    case 'invoice/add': {
      const inv: InvoiceRecord = { ...action.invoice, index: state.nextInvoiceIndex };
      return { ...state, invoices: [inv, ...state.invoices], nextInvoiceIndex: state.nextInvoiceIndex + 1 };
    }
    case 'invoice/recover': {
      const known = new Set(state.invoices.map((i) => i.index));
      const added: InvoiceRecord[] = [...new Set(action.indices)]
        .filter((i) => Number.isSafeInteger(i) && i >= 0 && !known.has(i))
        .map((index) => ({ index, amountYocto: null, note: '', createdAtMs: 0 }));
      if (added.length === 0) return state;
      const invoices = [...state.invoices, ...added].sort((a, b) => b.index - a.index);
      return { ...state, invoices, nextInvoiceIndex: Math.max(state.nextInvoiceIndex, ...added.map((i) => i.index + 1)) };
    }
    case 'sent/add': {
      const ids = new Set(action.records.map((r) => r.id));
      return { ...state, sent: [...action.records, ...state.sent.filter((r) => !ids.has(r.id))].slice(0, SENT_CAP) };
    }
    case 'claim/add':
      return { ...state, claims: { ...state.claims, [action.claim.stealthAccount]: action.claim } };
    case 'scan/set':
      return { ...state, scan: action.scan };
    case 'demo/update':
      return { ...state, demo: { ...state.demo, ...action.patch } };
    case 'reset':
      return initialState();
    case 'hydrate':
      return action.state;
  }
}
