/**
 * Invoices: deterministic one-time accounts from the view key (no
 * announcement), a pay link, and paid/open status from the live balance.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { deriveInvoice } from '@perde/core';
import { useAppState } from '../../state/context';
import { errorText } from '../../lib/errors';
import { parseNearToYocto } from '../../lib/near-format';
import { useToast } from '../../ui/toast-context';
import { fetchBalances, type LiveAccount } from '../../flows/scan';
import { buildPayLink, NOTE_MAX } from '../pay/params';
import type { Invoice, InvoiceModel, InvoiceStatus } from './types';

const POLL_MS = 8000;
const POLL_MAX_MS = 60_000;

export function statusOf(amountYocto: string | null, live: LiveAccount | undefined, claimed: boolean): InvoiceStatus {
  if (claimed) return 'claimed';
  if (!live) return 'checking';
  if (!live.exists || live.balanceYocto === 0n) return 'open';
  if (amountYocto !== null && live.balanceYocto < BigInt(amountYocto)) return 'partial';
  return 'paid';
}

export function useInvoice(): InvoiceModel {
  const { state, dispatch, identity } = useAppState();
  const toast = useToast();
  const [selected, setSelected] = useState<number | null>(null);
  const [live, setLive] = useState<Map<string, LiveAccount>>(new Map());
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const invoices: Invoice[] = useMemo(() => {
    if (!identity) return [];
    return state.invoices.map((r) => {
      const stealth = deriveInvoice(identity.viewKeys, r.index).stealthAccountId;
      const l = live.get(stealth);
      const claim = state.claims[stealth];
      return {
        index: r.index,
        stealthAccount: stealth,
        payLink: buildPayLink(stealth, { amountYocto: r.amountYocto, note: r.note }),
        amountYocto: r.amountYocto,
        memo: r.note,
        createdAtMs: r.createdAtMs,
        status: statusOf(r.amountYocto, l, !!claim),
        receivedYocto: claim ? claim.amountYocto : l ? l.balanceYocto.toString() : null,
        claimTxHash: claim?.txHash ?? null,
      };
    });
  }, [identity, state.invoices, state.claims, live]);

  const current = invoices.find((i) => i.index === selected) ?? invoices[0] ?? null;
  const accounts = invoices.map((i) => i.stealthAccount).join(',');

  // All invoices once; afterwards the shown one while it is still waiting for money.
  useEffect(() => {
    if (!accounts) return;
    let live = true;
    fetchBalances(accounts.split(','))
      .then((m) => {
        if (!live) return;
        setLive((prev) => new Map([...prev, ...m]));
        setBalanceError(null);
      })
      .catch((e: unknown) => live && setBalanceError(errorText(e)));
    return () => {
      live = false;
    };
  }, [accounts, tick]);

  const waiting = current && (current.status === 'open' || current.status === 'partial' || current.status === 'checking') ? current.stealthAccount : null;
  // Poll the open invoice: every 8 s at first, backing off to once a minute; paused while the tab is hidden.
  useEffect(() => {
    if (!waiting) return;
    let delay = POLL_MS;
    let timer = 0;
    const tick = () => {
      if (document.visibilityState === 'visible') {
        fetchBalances([waiting])
          .then((m) => setLive((prev) => new Map([...prev, ...m])))
          .catch(() => undefined);
        delay = Math.min(delay * 1.5, POLL_MAX_MS);
      }
      timer = window.setTimeout(tick, delay);
    };
    timer = window.setTimeout(tick, delay);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return {
    hasIdentity: !!identity,
    invoices,
    current,
    create({ amount, memo }) {
      let amountYocto: string | null = null;
      if (amount.trim()) {
        const p = parseNearToYocto(amount);
        if (!p.ok) return p.error;
        if (p.yocto === '0') return 'Amount must be more than 0, or leave it empty for any amount.';
        amountYocto = p.yocto;
      }
      dispatch({ type: 'invoice/add', invoice: { amountYocto, note: memo.trim().slice(0, NOTE_MAX), createdAtMs: Date.now() } });
      setSelected(state.nextInvoiceIndex);
      toast.show({ tone: 'success', title: `Invoice #${state.nextInvoiceIndex} created`, description: 'Share the pay link or QR code.' });
      return null;
    },
    select: setSelected,
    balanceError,
    refresh,
  };
}
