/**
 * Audit: decode a "perdeview:" key and scan read-only (announcements +
 * invoice accounts). There is no spend key anywhere in this flow.
 */
import { useCallback, useRef, useState } from 'react';
import { decodeViewingKey, encodeMetaAddress, type ViewKeys } from '@perde/core';
import { useAppState } from '../../state/context';
import { errorText } from '../../lib/errors';
import { fetchBalances, scanAnnouncementsFrom, scanInvoiceAccounts } from '../../flows/scan';
import type { AuditEntry, AuditModel, AuditState } from './types';

export function entryStatus(amount: bigint, balance: bigint, exists: boolean): AuditEntry['status'] {
  if (!exists || balance === 0n) return 'moved';
  return balance >= amount ? 'held' : 'partial';
}

export function useAudit(): AuditModel {
  const { identity } = useAppState();
  const [keyInput, setKeyInput] = useState('');
  const [state, setState] = useState<AuditState>({ status: 'idle' });
  const runId = useRef(0);

  const trimmed = keyInput.trim();
  let keyError: string | null = null;
  let viewKeys: ViewKeys | null = null;
  if (trimmed) {
    if (!trimmed.startsWith('perdeview:')) keyError = trimmed.startsWith('perde:') ? 'That is a meta-address (public). An audit needs the viewing key, which starts with “perdeview:”.' : 'A viewing key starts with “perdeview:”.';
    else {
      try {
        viewKeys = decodeViewingKey(trimmed);
      } catch (e) {
        keyError = (e as { code?: string }).code === 'BAD_CHECKSUM' ? 'Checksum mismatch: a character of this key is wrong or missing.' : 'This viewing key is damaged or incomplete.';
      }
    }
  }

  const run = useCallback(async () => {
    if (!viewKeys) return;
    const id = ++runId.current;
    const vk = viewKeys;
    const alive = () => id === runId.current;
    setState({ status: 'scanning', scanned: 0, total: null, stage: 'announcements' });
    try {
      const res = await scanAnnouncementsFrom(vk, 0, (p) => alive() && setState({ status: 'scanning', scanned: p.scanned, total: p.total, stage: 'announcements' }));
      if (!alive()) return;
      setState({ status: 'scanning', scanned: res.scanned, total: res.scanned, stage: 'invoices' });
      const invoices = await scanInvoiceAccounts(vk);
      if (!alive()) return;
      setState({ status: 'scanning', scanned: res.scanned, total: res.scanned, stage: 'balances' });
      const live = await fetchBalances(res.matches.map((a) => a.stealthAccountId));
      if (!alive()) return;
      const entries: AuditEntry[] = [
        ...res.matches.map((a): AuditEntry => {
          const l = live.get(a.stealthAccountId) ?? { exists: false, balanceYocto: 0n };
          return {
            stealthAccount: a.stealthAccountId,
            source: 'announcement',
            amountYocto: a.amount.toString(),
            balanceYocto: l.balanceYocto.toString(),
            exists: l.exists,
            timestampMs: a.timestampMs,
            announcementIndex: a.index,
            invoiceIndex: null,
            status: entryStatus(a.amount, l.balanceYocto, l.exists),
          };
        }),
        ...invoices.map(
          (i): AuditEntry => ({
            stealthAccount: i.stealthAccountId,
            source: 'invoice',
            amountYocto: i.balance.toString(),
            balanceYocto: i.balance.toString(),
            exists: true,
            timestampMs: null,
            announcementIndex: null,
            invoiceIndex: i.index,
            status: i.balance > 0n ? 'held' : 'moved',
          }),
        ),
      ].sort((a, b) => (b.timestampMs ?? 0) - (a.timestampMs ?? 0));
      setState({
        status: 'done',
        metaAddress: encodeMetaAddress(vk),
        entries,
        // Announced amounts plus what invoice accounts hold (invoices announce nothing).
        announcedYocto: entries.reduce((s, e) => s + BigInt(e.amountYocto), 0n).toString(),
        heldYocto: entries.reduce((s, e) => s + (e.exists ? BigInt(e.balanceYocto) : 0n), 0n).toString(),
        scanned: res.scanned,
      });
    } catch (e) {
      if (alive()) setState({ status: 'error', message: errorText(e, 'scan') });
    }
  }, [viewKeys]);

  return {
    keyInput,
    setKeyInput,
    keyError,
    canUseOwnKey: !!identity,
    fillOwnKey() {
      if (identity) setKeyInput(identity.viewingKey);
    },
    state,
    run: () => void run(),
    clear() {
      runId.current++;
      setKeyInput('');
      setState({ status: 'idle' });
    },
  };
}
