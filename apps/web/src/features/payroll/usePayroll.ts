/**
 * Payroll: CSV rows → names resolved on-chain → one transaction with one
 * `send` action per row (chunked into several transactions above the gas limit).
 */
import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../../state/context';
import type { SentRecord } from '../../state/schema';
import { perde } from '../../lib/perde';
import { errorText } from '../../lib/errors';
import { formatYocto } from '../../lib/near-format';
import { useSendLimits } from '../../lib/useSendLimits';
import { useToast } from '../../ui/toast-context';
import { executeBatch } from '../../flows/send';
import { PAYROLL_MAX_ROWS, parsePayrollCsv } from './csv';
import { planBatches } from './batch';
import type { CheckedRow, PayrollModel, PayrollPhase, PayrollResult } from './types';

type Lookup = { status: 'pending' } | { status: 'ok'; meta: string | null } | { status: 'error'; message: string };

export const SAMPLE_AMOUNT = '0.02';

export function usePayroll(): PayrollModel {
  const { dispatch, wallet, signer, balance, identity, refreshBalance } = useAppState();
  const toast = useToast();
  const { limits, error: limitsError } = useSendLimits();
  const [csv, setCsv] = useState('');
  const [phase, setPhase] = useState<PayrollPhase>({ phase: 'input' });
  const [lookups, setLookups] = useState<Record<string, Lookup>>({});
  const parsed = useMemo(() => parsePayrollCsv(csv), [csv]);

  // Resolve registered names (debounced, cached per name).
  const names = useMemo(() => [...new Set(parsed.filter((r) => !r.error && r.kind === 'name').map((r) => r.recipient.toLowerCase()))], [parsed]);
  const missing = names.filter((n) => !lookups[n]).join(',');
  useEffect(() => {
    if (!missing) return;
    const list = missing.split(',');
    const t = window.setTimeout(() => {
      setLookups((m) => ({ ...m, ...Object.fromEntries(list.map((n) => [n, { status: 'pending' } as Lookup])) }));
      for (const n of list) {
        perde
          .getMetaAddress(n)
          .then((meta) => setLookups((m) => ({ ...m, [n]: { status: 'ok', meta } })))
          .catch((e: unknown) => setLookups((m) => ({ ...m, [n]: { status: 'error', message: errorText(e) } })));
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [missing]);

  const rows: CheckedRow[] = useMemo(
    () =>
      parsed.map((r): CheckedRow => {
        if (r.error) return { ...r, status: 'invalid', problem: r.error, metaAddress: null };
        if (limits && r.amountYocto && BigInt(r.amountYocto) < limits.minAmountYocto) {
          return { ...r, status: 'invalid', problem: `Below the ${formatYocto(limits.minAmountYocto)} NEAR minimum`, metaAddress: null };
        }
        if (r.kind === 'meta') return { ...r, status: 'ready', problem: null, metaAddress: r.recipient };
        const l = lookups[r.recipient.toLowerCase()];
        if (!l || l.status === 'pending') return { ...r, status: 'resolving', problem: null, metaAddress: null };
        if (l.status === 'error') return { ...r, status: 'invalid', problem: `Lookup failed: ${l.message}`, metaAddress: null };
        if (l.meta === null) return { ...r, status: 'invalid', problem: 'No Perde meta-address registered for this name', metaAddress: null };
        return { ...r, status: 'ready', problem: null, metaAddress: l.meta };
      }),
    [parsed, lookups, limits],
  );

  const ready = rows.filter((r) => r.status === 'ready');
  const maxPerTx = perde.maxBatchSize;
  const batches = planBatches(ready, maxPerTx);
  const total = ready.reduce((s, r) => s + BigInt(r.amountYocto ?? '0'), 0n);
  const fee = limits ? limits.announceFeeYocto * BigInt(ready.length) : 0n;
  const gas = limits ? limits.gasPerSendYocto * BigInt(ready.length) : 0n;
  const spendable = balance.status === 'ready' ? BigInt(balance.spendableYocto) : null;
  const need = total + fee + gas;
  const balanceProblem =
    spendable !== null && ready.length > 0 && need > spendable
      ? `Not enough balance: ${formatYocto(need)} NEAR needed with fees and gas headroom, ${formatYocto(spendable)} NEAR available.`
      : null;

  const submit = async () => {
    if (!wallet || !signer || !limits || batches.length === 0) return;
    const results: PayrollResult[] = ready.map((r) => ({
      line: r.line,
      recipient: r.recipient,
      amountYocto: r.amountYocto ?? '0',
      memo: r.memo,
      status: 'not-sent',
      stealthAccount: null,
      announcementIndex: null,
      receipt: null,
      txHash: null,
      txNumber: null,
    }));
    const txs: string[] = [];
    let offset = 0;
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i] ?? [];
      setPhase({ phase: 'submitting', tx: i + 1, of: batches.length, step: 'sign' });
      try {
        const res = await executeBatch({
          signer,
          senderId: wallet.accountId,
          legs: batch.map((r) => ({ metaAddress: r.metaAddress ?? '', amountYocto: BigInt(r.amountYocto ?? '0') })),
          announceFeeYocto: limits.announceFeeYocto,
          onStep: (step) => setPhase({ phase: 'submitting', tx: i + 1, of: batches.length, step }),
        });
        txs.push(res.txHash);
        const records: SentRecord[] = [];
        res.legs.forEach((leg, k) => {
          const row = batch[k];
          const out = results[offset + k];
          if (!row || !out) return;
          Object.assign(out, {
            status: 'sent',
            stealthAccount: leg.stealth.stealthAccountId,
            announcementIndex: leg.announcementIndex,
            receipt: leg.receipt,
            txHash: res.txHash,
            txNumber: i + 1,
          });
          records.push({
            id: `${res.txHash}:${k}`,
            kind: 'payroll',
            txHash: res.txHash,
            atMs: Date.now(),
            senderId: wallet.accountId,
            recipientLabel: row.recipient,
            metaAddress: row.metaAddress,
            stealthAccount: leg.stealth.stealthAccountId,
            amountYocto: row.amountYocto ?? '0',
            feeYocto: limits.announceFeeYocto.toString(),
            receipt: leg.receipt,
            announcementIndex: leg.announcementIndex,
            memo: row.memo,
            batch: { tx: i + 1, of: batches.length },
          });
        });
        dispatch({ type: 'sent/add', records });
        offset += batch.length;
      } catch (e) {
        refreshBalance();
        if (txs.length === 0) {
          setPhase({ phase: 'error', message: errorText(e, 'send') });
        } else {
          setPhase({
            phase: 'done',
            results: [...results],
            txs,
            partialError: `Transaction ${i + 1} of ${batches.length} failed: ${errorText(e, 'send')} Rows from that transaction on were not paid.`,
          });
        }
        return;
      }
    }
    refreshBalance();
    setPhase({ phase: 'done', results: [...results], txs, partialError: null });
    toast.show({
      tone: 'success',
      title: `${ready.length} private payments sent`,
      description: batches.length === 1 ? 'In one transaction.' : `In ${batches.length} transactions.`,
    });
  };

  return {
    csv,
    setCsv,
    loadFile(file) {
      void file.text().then(setCsv);
    },
    rows,
    validCount: ready.length,
    invalidCount: rows.filter((r) => r.status === 'invalid').length,
    resolvingCount: rows.filter((r) => r.status === 'resolving').length,
    totalYocto: total.toString(),
    feeYocto: fee.toString(),
    gasYocto: gas.toString(),
    maxPerTx,
    txCount: batches.length,
    maxRows: PAYROLL_MAX_ROWS,
    sender: wallet ? { accountId: wallet.accountId, balanceYocto: balance.status === 'ready' ? balance.spendableYocto : null } : null,
    balanceProblem,
    limitsError,
    phase,
    canLoadSample: !!identity,
    loadSample() {
      if (!identity) return;
      const meta = identity.metaAddress;
      setCsv(`recipient,amount,memo\n${meta},${SAMPLE_AMOUNT},Sample row 1 (your own address)\n${meta},${SAMPLE_AMOUNT},Sample row 2 (your own address)\n`);
    },
    review: () => setPhase({ phase: 'review' }),
    submit: () => void submit(),
    back: () => setPhase({ phase: 'input' }),
    reset() {
      setCsv('');
      setPhase({ phase: 'input' });
    },
  };
}
