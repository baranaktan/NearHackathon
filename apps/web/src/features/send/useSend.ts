/**
 * Send: resolve the recipient (meta-address, or a name via the on-chain
 * directory), validate against the live balance, derive the stealth account
 * at review time, and pay exactly that account on confirm.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_CONFIG } from '../../config';
import { useAppState } from '../../state/context';
import type { SentRecord } from '../../state/schema';
import { perde } from '../../lib/perde';
import { errorText } from '../../lib/errors';
import { formatYocto, truncateMiddle } from '../../lib/near-format';
import { useSendLimits } from '../../lib/useSendLimits';
import { useToast } from '../../ui/toast-context';
import { deriveStealth, executeSend } from '../../flows/send';
import { txHashOf } from '../../flows/tx';
import { checkAmount, classifyRecipientInput, resolveRecipientInput } from './logic';
import type { RecipientResolution, SendModel, SendPhase, SendQuote } from './types';

const LOOKUP_DEBOUNCE_MS = 350;

export function useSend(options: { initialRecipient?: string; initialAmount?: string } = {}): SendModel {
  const { state, dispatch, wallet, signer, balance, identity, refreshBalance } = useAppState();
  const toast = useToast();
  const { limits, error: limitsError } = useSendLimits();
  const [recipientInput, setRecipientInput] = useState(options.initialRecipient ?? '');
  const [amountInput, setAmountInput] = useState(options.initialAmount ?? '');
  const [phase, setPhase] = useState<SendPhase>({ phase: 'edit' });
  const [lookup, setLookup] = useState<{ input: string; result: RecipientResolution } | null>(null);
  const derivations = useRef<{ stealth: ReturnType<typeof deriveStealth>; quote: SendQuote } | null>(null);

  // Meta-addresses and malformed input resolve synchronously; names need the contract.
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

  const spendable = balance.status === 'ready' ? BigInt(balance.spendableYocto) : null;
  const amount = checkAmount({
    input: amountInput,
    minYocto: limits?.minAmountYocto ?? null,
    feeYocto: limits?.announceFeeYocto ?? null,
    gasReserveYocto: limits?.gasPerSendYocto ?? null,
    spendableYocto: spendable,
  });

  const sender = wallet ? { accountId: wallet.accountId, balanceYocto: balance.status === 'ready' ? balance.spendableYocto : null, source: 'demo' as const } : null;
  const canReview = !!sender && !!signer && !!limits && spendable !== null && recipient.status === 'resolved' && amount.ok;

  const review = useCallback(() => {
    if (recipient.status !== 'resolved' || !amount.ok || !limits) return;
    const stealth = deriveStealth(recipient.metaAddress);
    const quote: SendQuote = {
      recipientLabel: recipient.name ?? recipient.metaAddress,
      metaAddress: recipient.metaAddress,
      stealthAccount: stealth.stealthAccountId,
      ephemeralPk: stealth.ephemeralPk,
      amountYocto: amount.yocto.toString(),
      announceFeeYocto: limits.announceFeeYocto.toString(),
      totalYocto: (amount.yocto + limits.announceFeeYocto).toString(),
      gasReserveYocto: limits.gasPerSendYocto.toString(),
    };
    derivations.current = { stealth, quote };
    setPhase({ phase: 'review', quote });
  }, [recipient, amount, limits]);

  const confirm = useCallback(async () => {
    const d = derivations.current;
    if (phase.phase !== 'review' || !d || !wallet || !signer) return;
    const { stealth, quote } = d;
    setPhase({ phase: 'submitting', quote, step: 'sign' });
    try {
      const res = await executeSend({
        signer,
        senderId: wallet.accountId,
        metaAddress: quote.metaAddress,
        stealth,
        amountYocto: BigInt(quote.amountYocto),
        announceFeeYocto: BigInt(quote.announceFeeYocto),
        onStep: (step) => setPhase({ phase: 'submitting', quote, step }),
      });
      const record: SentRecord = {
        id: res.txHash,
        kind: 'send',
        txHash: res.txHash,
        atMs: Date.now(),
        senderId: wallet.accountId,
        recipientLabel: quote.recipientLabel,
        metaAddress: quote.metaAddress,
        stealthAccount: quote.stealthAccount,
        amountYocto: quote.amountYocto,
        feeYocto: quote.announceFeeYocto,
        receipt: res.receipt,
        announcementIndex: res.announcementIndex,
        memo: '',
        batch: null,
      };
      dispatch({ type: 'sent/add', records: [record] });
      derivations.current = null;
      refreshBalance();
      setPhase({ phase: 'success', quote, txHash: res.txHash, receipt: res.receipt, announcementIndex: res.announcementIndex, record });
      const label = quote.recipientLabel.startsWith('perde:') ? truncateMiddle(quote.recipientLabel, 12, 6) : quote.recipientLabel;
      toast.show({ tone: 'success', title: 'Payment sent', description: `${formatYocto(quote.amountYocto)} NEAR to ${label}, in a fresh account.` });
    } catch (e) {
      refreshBalance();
      setPhase({ phase: 'error', quote, message: errorText(e, 'send'), txHash: txHashOf(e) });
    }
  }, [phase, wallet, signer, dispatch, refreshBalance, toast]);

  return {
    sender,
    contractId: APP_CONFIG.contractId,
    recipientInput,
    setRecipientInput,
    recipient,
    selfMetaAddress: identity?.metaAddress ?? null,
    amountInput,
    setAmountInput,
    amountError: amount.ok ? null : amount.error,
    limits: limits
      ? { minAmountYocto: limits.minAmountYocto.toString(), announceFeeYocto: limits.announceFeeYocto.toString(), gasReserveYocto: limits.gasPerSendYocto.toString() }
      : null,
    limitsError,
    phase,
    canReview,
    review,
    confirm() {
      void confirm();
    },
    back() {
      setPhase({ phase: 'edit' });
    },
    reset() {
      derivations.current = null;
      setPhase({ phase: 'edit' });
      setRecipientInput('');
      setAmountInput('');
    },
    history: state.sent.slice(0, 5),
  };
}
