/**
 * "Pay someone from here": the stealth account itself signs a Perde `send`
 * (with its derived scalar), so funds move stealth → fresh stealth with a new
 * announcement and the person's named accounts never appear.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StealthDerivation } from '@perde/core';
import { useAppState } from '../../state/context';
import type { SentRecord } from '../../state/schema';
import { perde } from '../../lib/perde';
import { errorText } from '../../lib/errors';
import { formatYocto } from '../../lib/near-format';
import { useToast } from '../../ui/toast-context';
import { fetchBalances } from '../../flows/scan';
import { deriveStealth, executeSend } from '../../flows/send';
import { stealthSigner } from '../../flows/claim';
import { txHashOf, type TxStep } from '../../flows/tx';
import { classifyRecipientInput, resolveRecipientInput } from '../send/logic';
import type { RecipientResolution } from '../send/types';
import { checkOnwardAmount, onwardLimits, onwardPreview, sendAllInput, settleOnward, type OnwardCosts, type OnwardLimits, type OnwardPreview, type OnwardSettlement } from './onward';
import type { FoundPayment, InboxModel } from './types';

const LOOKUP_DEBOUNCE_MS = 350;

export interface OnwardQuote {
  recipientLabel: string;
  metaAddress: string;
  isSelf: boolean;
  stealth: StealthDerivation;
  amountYocto: bigint;
  costs: OnwardCosts;
  preview: OnwardPreview;
}

export type OnwardPhase =
  | { phase: 'form' }
  | { phase: 'review'; quote: OnwardQuote }
  | { phase: 'sending'; quote: OnwardQuote; step: TxStep; startedAtMs: number }
  | { phase: 'done'; quote: OnwardQuote; txHash: string; receipt: string; announcementIndex: number | null; settlement: OnwardSettlement | null }
  | { phase: 'error'; quote: OnwardQuote; message: string; txHash: string | null };

export function useOnward(m: InboxModel, payment: FoundPayment | null) {
  const { dispatch, identity } = useAppState();
  const toast = useToast();
  const [recipientInput, setRecipientInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [phase, setPhase] = useState<OnwardPhase>({ phase: 'form' });
  const [lookup, setLookup] = useState<{ input: string; result: RecipientResolution } | null>(null);
  const [fresh, setFresh] = useState<{ account: string; balance: bigint } | null>(null);

  // Reset when the dialog opens for another payment.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if ((payment?.id ?? null) !== openedFor) {
    setOpenedFor(payment?.id ?? null);
    setRecipientInput('');
    setAmountInput('');
    setPhase({ phase: 'form' });
    setFresh(null);
  }

  // Read the balance once on open: the list may be a few seconds old.
  const account = payment?.stealthAccount ?? null;
  useEffect(() => {
    if (!account) return;
    let live = true;
    fetchBalances([account])
      .then((b) => live && setFresh({ account, balance: b.get(account)?.balanceYocto ?? 0n }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [account]);

  const classified = useMemo(() => classifyRecipientInput(recipientInput), [recipientInput]);
  useEffect(() => {
    if (classified.kind !== 'name') return;
    const input = recipientInput;
    let live = true;
    const t = window.setTimeout(() => {
      resolveRecipientInput(input, (name) => perde.getMetaAddress(name))
        .then((result) => live && setLookup({ input, result }))
        .catch((e: unknown) => live && setLookup({ input, result: { status: 'invalid', message: `Couldn’t look up that name: ${errorText(e)}` } }));
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [classified, recipientInput]);

  const recipient: RecipientResolution = useMemo(() => {
    switch (classified.kind) {
      case 'empty':
        return { status: 'empty' };
      case 'invalid':
        return { status: 'invalid', message: classified.message };
      case 'meta':
        return { status: 'resolved', input: recipientInput.trim(), kind: 'meta', metaAddress: classified.metaAddress, name: null };
      case 'name':
        return lookup?.input === recipientInput ? lookup.result : { status: 'resolving' };
    }
  }, [classified, lookup, recipientInput]);

  const terms = m.onwardTerms;
  const balance = fresh && fresh.account === account ? fresh.balance : payment?.balanceYocto ? BigInt(payment.balanceYocto) : null;
  const costs: OnwardCosts | null = useMemo(
    () =>
      terms && balance !== null ? { balanceYocto: balance, announceFeeYocto: terms.announceFeeYocto, gasReserveYocto: terms.gasReserveYocto, minAmountYocto: terms.minAmountYocto } : null,
    [terms, balance],
  );
  const limits: OnwardLimits | null = useMemo(() => (costs ? onwardLimits(costs) : null), [costs]);
  const amount = useMemo(
    () => (limits && terms ? checkOnwardAmount(amountInput, limits, terms.minAmountYocto) : ({ ok: false, error: null } as const)),
    [limits, terms, amountInput],
  );
  const preview = costs && amount.ok ? onwardPreview(costs, amount.yocto) : null;
  const isSelf = recipient.status === 'resolved' && recipient.metaAddress === m.selfMetaAddress;
  const canReview = !!identity && !!limits?.canPay && recipient.status === 'resolved' && amount.ok;

  const review = useCallback(() => {
    if (!canReview || recipient.status !== 'resolved' || !amount.ok || !costs) return;
    const quote: OnwardQuote = {
      recipientLabel: recipient.name ?? recipient.metaAddress,
      metaAddress: recipient.metaAddress,
      isSelf,
      stealth: deriveStealth(recipient.metaAddress),
      amountYocto: amount.yocto,
      costs,
      preview: onwardPreview(costs, amount.yocto),
    };
    setPhase({ phase: 'review', quote });
  }, [canReview, recipient, amount, costs, isSelf]);

  const confirm = useCallback(async () => {
    if (phase.phase !== 'review' || !payment || !identity) return;
    const { quote } = phase;
    const startedAtMs = Date.now();
    const onStep = (step: TxStep) => setPhase({ phase: 'sending', quote, step, startedAtMs });
    onStep('sign');
    try {
      const target = m.claimTarget(payment.id);
      if (!target) throw new Error('This payment is no longer in the scan cache. Rescan, then try again.');
      const signer = stealthSigner(identity.keys, target);
      if (signer.accountId !== payment.stealthAccount) throw new Error('The derived key does not match this payment’s account.');
      const res = await executeSend({
        signer,
        senderId: payment.stealthAccount,
        metaAddress: quote.metaAddress,
        stealth: quote.stealth,
        amountYocto: quote.amountYocto,
        announceFeeYocto: quote.costs.announceFeeYocto,
        onStep,
      });
      const record: SentRecord = {
        id: res.txHash,
        kind: 'onward',
        txHash: res.txHash,
        atMs: Date.now(),
        senderId: payment.stealthAccount,
        recipientLabel: quote.isSelf ? 'Yourself (paid onward)' : quote.recipientLabel,
        metaAddress: quote.metaAddress,
        stealthAccount: quote.stealth.stealthAccountId,
        amountYocto: quote.amountYocto.toString(),
        feeYocto: quote.costs.announceFeeYocto.toString(),
        receipt: res.receipt,
        announcementIndex: res.announcementIndex,
        memo: '',
        batch: null,
      };
      dispatch({ type: 'sent/add', records: [record] });
      setPhase({ phase: 'sending', quote, step: 'confirm', startedAtMs });
      // What actually stayed behind, once the gas refund has landed.
      const after = await m.refreshAccount(payment.stealthAccount, quote.costs.balanceYocto);
      const settlement = after === null ? null : settleOnward(quote.costs, quote.amountYocto, after);
      setPhase({ phase: 'done', quote, txHash: res.txHash, receipt: res.receipt, announcementIndex: res.announcementIndex, settlement });
      toast.show({ tone: 'success', title: 'Paid onward', description: `${formatYocto(quote.amountYocto)} NEAR left a stealth account for a fresh one. Your named accounts never appeared.` });
      if (quote.isSelf) m.rescan();
    } catch (e) {
      setPhase({ phase: 'error', quote, message: errorText(e, 'send'), txHash: txHashOf(e) });
    }
  }, [phase, payment, identity, m, dispatch, toast]);

  return {
    recipientInput,
    setRecipientInput,
    recipient,
    isSelf,
    amountInput,
    setAmountInput,
    amountError: amount.ok ? null : amount.error,
    balance,
    limits,
    preview,
    canReview,
    phase,
    review,
    confirm: () => void confirm(),
    back: () => setPhase({ phase: 'form' }),
    sendAll: limits?.canPay
      ? () => {
          setAmountInput(sendAllInput(limits));
        }
      : undefined,
  };
}

export type OnwardModel = ReturnType<typeof useOnward>;
