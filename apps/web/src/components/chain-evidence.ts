/**
 * Fetch exactly what a public observer can read about a payment: the real
 * transaction(s) from RPC and the announcement row from the contract.
 */
import { useEffect, useState } from 'react';
import { perde, rpc } from '../lib/perde';
import { errorText } from '../lib/errors';
import type { ClaimRecord, SentRecord } from '../state/schema';

export type ChainSubject =
  | { kind: 'sent'; record: SentRecord }
  | {
      kind: 'received';
      stealthAccount: string;
      announcementIndex: number | null;
      invoiceIndex: number | null;
      amountYocto: string;
      claim: ClaimRecord | null;
      /** Set when this browser also sent the payment (e.g. paying yourself): shows the real paying transaction. */
      sentRecord: SentRecord | null;
      /** Payments made from this stealth account to fresh ones ("pay onward"). */
      onward: SentRecord[];
    };

export type TxAction =
  | { kind: 'FunctionCall'; method: string; depositYocto: string; gas: string; args: Record<string, unknown> | null }
  | { kind: 'Transfer'; depositYocto: string }
  | { kind: 'DeleteAccount'; beneficiary: string }
  | { kind: 'Other'; name: string };

export interface TxEvidence {
  hash: string;
  signerId: string;
  receiverId: string;
  actions: TxAction[];
  success: boolean;
  tokensBurntYocto: string;
}

export interface AnnouncementEvidence {
  index: number;
  stealthAccount: string;
  ephemeralPk: string;
  viewTag: number;
  amountYocto: string;
  timestampMs: number;
}

export interface Evidence {
  payTx: TxEvidence | null;
  announcement: AnnouncementEvidence | null;
  claimTx: TxEvidence | null;
  /** Transactions that paid onward from the stealth account, in the order of `subject.onward`. */
  onwardTxs: TxEvidence[];
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

function decodeArgs(b64: unknown): Record<string, unknown> | null {
  if (typeof b64 !== 'string') return null;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isObj(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseActions(raw: unknown): TxAction[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a): TxAction => {
    if (typeof a === 'string') return { kind: 'Other', name: a };
    if (isObj(a)) {
      const fc = a.FunctionCall;
      if (isObj(fc)) {
        return {
          kind: 'FunctionCall',
          method: typeof fc.method_name === 'string' ? fc.method_name : '?',
          depositYocto: typeof fc.deposit === 'string' ? fc.deposit : '0',
          gas: String(fc.gas ?? '0'),
          args: decodeArgs(fc.args),
        };
      }
      const tr = a.Transfer;
      if (isObj(tr)) return { kind: 'Transfer', depositYocto: typeof tr.deposit === 'string' ? tr.deposit : '0' };
      const del = a.DeleteAccount;
      if (isObj(del)) return { kind: 'DeleteAccount', beneficiary: typeof del.beneficiary_id === 'string' ? del.beneficiary_id : '?' };
      return { kind: 'Other', name: Object.keys(a)[0] ?? '?' };
    }
    return { kind: 'Other', name: '?' };
  });
}

async function fetchTx(hash: string, senderId: string): Promise<TxEvidence> {
  const o = await rpc.txStatus(hash, senderId, 'EXECUTED_OPTIMISTIC');
  const tx = o.raw.transaction as unknown as Obj;
  return {
    hash: o.hash,
    signerId: o.signerId,
    receiverId: o.receiverId,
    actions: parseActions(tx.actions),
    success: o.success,
    tokensBurntYocto: o.tokensBurnt.toString(),
  };
}

async function fetchAnnouncement(index: number): Promise<AnnouncementEvidence | null> {
  const page = await perde.fetchAnnouncements({ fromIndex: index, limit: 1 });
  const a = page.announcements[0];
  if (!a || a.index !== index) return null;
  return { index: a.index, stealthAccount: a.stealthAccountId, ephemeralPk: a.ephemeralPk, viewTag: a.viewTag, amountYocto: a.amount.toString(), timestampMs: a.timestampMs };
}

export async function loadEvidence(subject: ChainSubject): Promise<Evidence> {
  if (subject.kind === 'sent') {
    const r = subject.record;
    const [payTx, announcement] = await Promise.all([
      fetchTx(r.txHash, r.senderId),
      r.announcementIndex !== null ? fetchAnnouncement(r.announcementIndex) : Promise.resolve(null),
    ]);
    return { payTx, announcement, claimTx: null, onwardTxs: [] };
  }
  const [payTx, announcement, claimTx, onwardTxs] = await Promise.all([
    subject.sentRecord ? fetchTx(subject.sentRecord.txHash, subject.sentRecord.senderId) : Promise.resolve(null),
    subject.announcementIndex !== null ? fetchAnnouncement(subject.announcementIndex) : Promise.resolve(null),
    subject.claim ? fetchTx(subject.claim.txHash, subject.stealthAccount) : Promise.resolve(null),
    Promise.all(subject.onward.map((r) => fetchTx(r.txHash, r.senderId))),
  ]);
  return { payTx, announcement, claimTx, onwardTxs };
}

export type EvidenceState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; evidence: Evidence } | { status: 'error'; message: string };

function subjectKey(s: ChainSubject | null): string {
  if (!s) return '';
  return s.kind === 'sent'
    ? `s:${s.record.txHash}:${s.record.stealthAccount}`
    : `r:${s.stealthAccount}:${s.claim?.txHash ?? ''}:${s.sentRecord?.txHash ?? ''}:${s.onward.map((r) => r.txHash).join(',')}`;
}

export function useEvidence(subject: ChainSubject | null, open: boolean) {
  const [state, setState] = useState<{ key: string; value: EvidenceState }>({ key: '', value: { status: 'idle' } });
  const [attempt, setAttempt] = useState(0);
  const key = subjectKey(subject);

  useEffect(() => {
    if (!open || !subject) return;
    let live = true;
    loadEvidence(subject)
      .then((evidence) => live && setState({ key, value: { status: 'ready', evidence } }))
      .catch((e: unknown) => live && setState({ key, value: { status: 'error', message: errorText(e) } }));
    return () => {
      live = false;
    };
    // `key` identifies the subject; the object itself is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, attempt]);

  const value: EvidenceState = !subject ? { status: 'idle' } : state.key === key ? state.value : { status: 'loading' };
  return {
    state: value,
    retry: () => {
      setState({ key, value: { status: 'loading' } });
      setAttempt((a) => a + 1);
    },
  };
}
