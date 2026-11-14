/**
 * Send page data. PREVIEW IMPLEMENTATION — fixtures only. Replace with:
 * resolve recipient (meta-address or `get_meta_address(name)`), derive the
 * stealth account with @perde/core, call contract `send`; keep `SendModel`.
 */
import { useMemo, useState } from 'react';
import type { RecipientResolution, SendModel, SendPhase } from './types';
import { classifyRecipient, parseNearToYocto } from '../../lib/near-format';
import { fx, fxQuote, fxReceipt } from '../../preview-fixtures/data';
import { previewDelay, usePreviewState } from '../../preview-fixtures/preview-state';

function initialPhase(state: string): SendPhase {
  switch (state) {
    case 'review':
      return { phase: 'review', quote: fxQuote };
    case 'submitting':
      return { phase: 'submitting', quote: fxQuote, step: 'broadcast' };
    case 'success':
      return { phase: 'success', quote: fxQuote, txHash: fx.txHashes[0], receipt: fxReceipt };
    case 'error':
      return { phase: 'error', quote: fxQuote, message: 'Transaction failed: the sender balance is lower than amount + fee + gas.' };
    default:
      return { phase: 'edit' };
  }
}

export function useSend(): SendModel {
  const preview = usePreviewState('/app/send');
  const filled = preview !== 'edit' && preview !== 'no-sender';
  const [recipientInput, setRecipientInput] = useState(filled ? fx.recipientAccount : '');
  const [amountInput, setAmountInput] = useState(filled ? '2.5' : '');
  const [phase, setPhase] = useState<SendPhase>(() => initialPhase(preview));

  const recipient = useMemo<RecipientResolution>(() => {
    const v = recipientInput.trim();
    if (!v) return { status: 'empty' };
    const kind = classifyRecipient(v);
    if (kind === 'meta') return { status: 'resolved', input: v, kind: 'meta', metaAddress: v, name: null };
    if (kind === 'name') {
      if (v === fx.recipientAccount) return { status: 'resolved', input: v, kind: 'name', metaAddress: fx.identity.metaAddress, name: v };
      return { status: 'invalid', message: `${v} has no Perde meta-address registered.` };
    }
    if (kind === 'implicit') return { status: 'invalid', message: 'That is a plain account id. Ask the recipient for their perde: address or NEAR name.' };
    return { status: 'invalid', message: 'Enter a perde: meta-address or a NEAR account name.' };
  }, [recipientInput]);

  const amount = parseNearToYocto(amountInput);
  const amountError = amountInput === '' ? null : !amount.ok ? amount.error : amount.yocto === '0' ? 'Amount must be more than 0' : null;
  const sender = preview === 'no-sender' ? null : { accountId: fx.senderAccount, balanceYocto: fx.NEAR('9.87'), source: 'demo' as const };

  return {
    sender,
    contractId: fx.contractId,
    recipientInput,
    setRecipientInput,
    recipient,
    amountInput,
    setAmountInput,
    amountError,
    limits: { minAmountYocto: fx.NEAR('0.01'), announceFeeYocto: fx.NEAR('0.002') },
    phase,
    canReview: !!sender && recipient.status === 'resolved' && amount.ok && amount.yocto !== '0',
    review() {
      if (recipient.status !== 'resolved' || !amount.ok) return;
      const fee = BigInt(fx.NEAR('0.002'));
      setPhase({
        phase: 'review',
        quote: {
          ...fxQuote,
          recipientLabel: recipient.name ?? recipient.metaAddress,
          metaAddress: recipient.metaAddress,
          amountYocto: amount.yocto,
          totalYocto: (BigInt(amount.yocto) + fee).toString(),
        },
      });
    },
    confirm() {
      if (phase.phase !== 'review') return;
      const quote = phase.quote;
      setPhase({ phase: 'submitting', quote, step: 'sign' });
      void previewDelay(700)
        .then(() => setPhase({ phase: 'submitting', quote, step: 'broadcast' }))
        .then(() => previewDelay(900))
        .then(() => setPhase({ phase: 'submitting', quote, step: 'confirm' }))
        .then(() => previewDelay(900))
        .then(() => setPhase({ phase: 'success', quote, txHash: fx.txHashes[0], receipt: fxReceipt }));
    },
    back() {
      setPhase({ phase: 'edit' });
    },
    reset() {
      setPhase({ phase: 'edit' });
      setRecipientInput('');
      setAmountInput('');
    },
  };
}
