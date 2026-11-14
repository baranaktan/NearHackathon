/**
 * Inbox: incremental scan of announcements with the identity's view keys
 * (cursor cached in localStorage), plus invoice accounts (gap limit 20), live
 * balances, and claims signed in the browser with the stealth scalar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deriveInvoice, isImplicitAccountId, isValidAccountId, pollUntil, type Claimable, type ViewKeys } from '@perde/core';
import { useAppState } from '../../state/context';
import { perde, rpc } from '../../lib/perde';
import { errorText } from '../../lib/errors';
import { formatYocto, truncateMiddle } from '../../lib/near-format';
import { useToast } from '../../ui/toast-context';
import { fetchBalances, scanAnnouncementsFrom, scanInvoiceAccounts, type LiveAccount } from '../../flows/scan';
import { mergeScan, scanStart } from '../../state/scan-cache';
import { claimStealth } from '../../flows/claim';
import { txHashOf } from '../../flows/tx';
import type { ClaimEstimate, ClaimMode, ClaimState, FoundPayment, InboxModel, ScanState } from './types';

const RECENT_MS = 3 * 60_000;

interface InvoiceHit {
  index: number;
  stealthAccount: string;
}

export function useInbox(): InboxModel {
  const { state, dispatch, identity, wallet, refreshBalance } = useAppState();
  const toast = useToast();
  const meta = identity?.metaAddress ?? null;
  const [scan, setScan] = useState<ScanState>({ status: 'idle' });
  const [live, setLive] = useState<Map<string, LiveAccount>>(new Map());
  const [invoiceHits, setInvoiceHits] = useState<InvoiceHit[]>([]);
  const [inflight, setInflight] = useState<Record<string, ClaimState>>({});
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);
  const running = useRef(false);

  const cache = state.scan && state.scan.metaAddress === meta ? state.scan : null;

  const runScan = useCallback(
    async (fromStart: boolean) => {
      if (!identity || running.current) return;
      running.current = true;
      const metaAddress = identity.metaAddress;
      const prior = fromStart ? null : latest.current.scan;
      const from = fromStart ? 0 : scanStart(prior, metaAddress);
      setScan({ status: 'scanning', scanned: 0, total: null });
      try {
        const res = await scanAnnouncementsFrom(identity.viewKeys, from, (p) => setScan({ status: 'scanning', scanned: p.scanned, total: p.total }));
        const merged = mergeScan(prior, metaAddress, res.matches, res.nextIndex, Date.now());
        dispatch({ type: 'scan/set', scan: merged });
        const invoices = await scanInvoiceAccounts(identity.viewKeys);
        const hits = invoices.map((i) => ({ index: i.index, stealthAccount: i.stealthAccountId }));
        setInvoiceHits(hits);
        const accounts = [...merged.payments.map((p) => p.stealthAccount), ...hits.map((h) => h.stealthAccount)];
        const balances = await fetchBalances(accounts);
        // A payment made moments ago may not be visible yet on the node we hit: poll those briefly.
        const lagging = merged.payments.filter(
          (p) => !balances.get(p.stealthAccount)?.exists && !latest.current.claims[p.stealthAccount] && Date.now() - p.timestampMs < RECENT_MS,
        );
        for (const p of lagging) {
          try {
            const v = await pollUntil(() => rpc.viewAccountOrNull(p.stealthAccount), (x) => x !== null, { timeoutMs: 10_000, what: 'the new account' });
            if (v) balances.set(p.stealthAccount, { exists: true, balanceYocto: v.amount });
          } catch {
            /* still not visible: shown as empty, a rescan will pick it up */
          }
        }
        setLive(balances);
        setScan({ status: 'done', scanned: res.scanned, finishedAtMs: Date.now() });
      } catch (e) {
        setScan({ status: 'error', message: errorText(e, 'scan') });
      } finally {
        running.current = false;
      }
    },
    [identity, dispatch],
  );

  useEffect(() => {
    if (!identity) return;
    const t = window.setTimeout(() => void runScan(false), 0);
    return () => window.clearTimeout(t);
  }, [identity, runScan]);

  const payments: FoundPayment[] = useMemo(() => {
    const claimState = (stealth: string): ClaimState => {
      const rec = state.claims[stealth];
      if (rec) return { status: 'claimed', destination: rec.destination, txHash: rec.txHash, claimedYocto: rec.amountYocto, mode: rec.mode };
      return inflight[stealth] ?? { status: 'unclaimed' };
    };
    const sentBy = new Map(state.sent.map((r) => [r.stealthAccount, r]));
    const ann: FoundPayment[] = (cache?.payments ?? []).map((p) => {
      const l = live.get(p.stealthAccount);
      return {
        id: `a${p.index}`,
        stealthAccount: p.stealthAccount,
        amountYocto: p.amountYocto,
        balanceYocto: l ? l.balanceYocto.toString() : null,
        exists: l ? l.exists : null,
        timestampMs: p.timestampMs,
        announcementIndex: p.index,
        invoiceIndex: null,
        note: '',
        source: 'announcement',
        claim: claimState(p.stealthAccount),
        claimRecord: state.claims[p.stealthAccount] ?? null,
        sentRecord: sentBy.get(p.stealthAccount) ?? null,
      };
    });
    const localInvoices = new Map(state.invoices.map((i) => [i.index, i]));
    const invoiceIds = new Map<number, string>(invoiceHits.map((h) => [h.index, h.stealthAccount]));
    // Claimed invoices whose account was deleted no longer show up in the scan; keep them from the claim history.
    if (identity) {
      for (const inv of state.invoices) {
        if (invoiceIds.has(inv.index)) continue;
        const id = perdeInvoiceAccount(identity.viewKeys, inv.index);
        if (state.claims[id]) invoiceIds.set(inv.index, id);
      }
    }
    const inv: FoundPayment[] = [...invoiceIds.entries()].map(([index, stealth]) => {
      const l = live.get(stealth);
      const rec = state.claims[stealth];
      const local = localInvoices.get(index);
      return {
        id: `i${index}`,
        stealthAccount: stealth,
        amountYocto: rec ? rec.amountYocto : (l?.balanceYocto ?? 0n).toString(),
        balanceYocto: l ? l.balanceYocto.toString() : rec ? '0' : null,
        exists: l ? l.exists : rec ? false : null,
        timestampMs: local?.createdAtMs ?? null,
        announcementIndex: null,
        invoiceIndex: index,
        note: local?.note ?? '',
        source: 'invoice',
        claim: claimState(stealth),
        claimRecord: rec ?? null,
        sentRecord: sentBy.get(stealth) ?? null,
      };
    });
    return [...ann, ...inv].sort((a, b) => (b.timestampMs ?? 0) - (a.timestampMs ?? 0));
  }, [cache, live, invoiceHits, state.claims, state.invoices, state.sent, inflight, identity]);

  const unclaimed = payments
    .filter((p) => p.claim.status !== 'claimed' && p.exists)
    .reduce((s, p) => s + BigInt(p.balanceYocto ?? '0'), 0n)
    .toString();

  const findPayment = useCallback((id: string) => payments.find((p) => p.id === id) ?? null, [payments]);

  const estimateClaim = useCallback(
    async (id: string, destination: string, mode: ClaimMode): Promise<ClaimEstimate> => {
      const p = findPayment(id);
      if (!p) return { status: 'error', message: 'Payment not found.' };
      const dest = destination.trim();
      if (!isValidAccountId(dest)) return { status: 'error', message: 'Enter a NEAR account id (name.testnet or 64-hex).' };
      if (dest === p.stealthAccount) return { status: 'error', message: 'That is the stealth account itself.' };
      try {
        const [fee, destExists] = await Promise.all([perde.estimateClaimFee(dest, mode), rpc.accountExists(dest)]);
        const balance = BigInt(p.balanceYocto ?? '0');
        if (mode === 'deleteAccount') {
          const receive = balance > fee.expectedFee ? balance - fee.expectedFee : 0n;
          return {
            status: 'ready',
            destinationExists: destExists,
            receiveYocto: receive.toString(),
            feeYocto: fee.expectedFee.toString(),
            leavesDust: false,
            blocker: !destExists ? 'A full sweep needs a destination that already exists. Use transfer mode for a brand-new implicit account.' : receive === 0n ? 'The balance is too small to cover the claim.' : null,
          };
        }
        const receive = balance > fee.reserve ? balance - fee.reserve : 0n;
        return {
          status: 'ready',
          destinationExists: destExists,
          receiveYocto: receive.toString(),
          feeYocto: fee.reserve.toString(),
          leavesDust: true,
          blocker:
            !destExists && !isImplicitAccountId(dest)
              ? `${dest} doesn’t exist on testnet.`
              : receive === 0n
                ? 'The balance is too small to cover the gas reserve.'
                : null,
        };
      } catch (e) {
        return { status: 'error', message: errorText(e, 'claim') };
      }
    },
    [findPayment],
  );

  const claim = useCallback(
    async (id: string, destination: string, mode: ClaimMode) => {
      const p = findPayment(id);
      if (!p || !identity) return;
      const dest = destination.trim();
      setInflight((m) => ({ ...m, [p.stealthAccount]: { status: 'claiming', destination: dest } }));
      try {
        // The account must be visible to the node that builds the transaction.
        await pollUntil(() => rpc.viewAccountOrNull(p.stealthAccount), (v) => v !== null, { timeoutMs: 10_000, what: 'the stealth account' });
        const ann = cache?.payments.find((c) => c.stealthAccount === p.stealthAccount);
        let target: Claimable;
        if (p.invoiceIndex !== null) target = { invoiceIndex: p.invoiceIndex };
        else if (ann) target = { stealthAccountId: ann.stealthAccount, ephemeralPk: ann.ephemeralPk, viewTag: ann.viewTag };
        else throw new Error('This payment is no longer in the scan cache. Rescan, then claim again.');
        const res = await claimStealth(identity.keys, target, dest, mode);
        const received = res.movedYocto;
        dispatch({
          type: 'claim/add',
          claim: { stealthAccount: p.stealthAccount, txHash: res.txHash, destination: dest, amountYocto: received.toString(), mode, atMs: Date.now() },
        });
        setInflight((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== p.stealthAccount)));
        toast.show({ tone: 'success', title: 'Claimed', description: `${formatYocto(received)} NEAR moved to ${truncateMiddle(dest, 14, 8)}.` });
        if (dest === wallet?.accountId) refreshBalance();
        // Read the swept account back (bounded) so the list shows its new state.
        try {
          const after = await pollUntil(
            () => fetchBalances([p.stealthAccount]),
            (m) => {
              const a = m.get(p.stealthAccount);
              return !!a && (!a.exists || a.balanceYocto < res.balanceBefore);
            },
            { timeoutMs: 10_000, what: 'the claimed account' },
          );
          setLive((prev) => new Map([...prev, ...after]));
        } catch {
          /* the claim record already marks it as claimed */
        }
      } catch (e) {
        const hash = txHashOf(e);
        const message = errorText(e, 'claim') + (hash ? ` Check transaction ${hash.slice(0, 8)}… on the explorer before retrying.` : '');
        setInflight((m) => ({ ...m, [p.stealthAccount]: { status: 'error', destination: dest, message } }));
      }
    },
    [findPayment, identity, cache, dispatch, toast, wallet, refreshBalance],
  );

  return {
    hasIdentity: !!identity,
    scan,
    payments,
    unclaimedYocto: unclaimed,
    destinationSuggestions: wallet ? [wallet.accountId] : [],
    cursor: cache?.nextIndex ?? 0,
    rescan: () => void runScan(false),
    rescanFromStart: () => void runScan(true),
    estimateClaim,
    claim: (id, dest, mode) => void claim(id, dest, mode),
  };
}

function perdeInvoiceAccount(viewKeys: ViewKeys, index: number): string {
  return deriveInvoice(viewKeys, index).stealthAccountId;
}
