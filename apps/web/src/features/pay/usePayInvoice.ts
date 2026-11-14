/** Pay an invoice account from the demo wallet with a plain Transfer (no contract, no announcement). */
import { useCallback, useEffect, useState } from 'react';
import { pollUntil } from '@perde/core';
import { useAppState } from '../../state/context';
import { rpc, transferGasReserve } from '../../lib/perde';
import { errorText } from '../../lib/errors';
import { formatYocto, parseNearToYocto } from '../../lib/near-format';
import { payInvoiceTransfer } from '../../flows/send';
import { txHashOf, type TxStep } from '../../flows/tx';

export type InvoicePayPhase =
  | { phase: 'edit' }
  | { phase: 'submitting'; step: TxStep }
  | { phase: 'success'; txHash: string; amountYocto: string; arrived: boolean }
  | { phase: 'error'; message: string; txHash: string | null };

export function usePayInvoice(account: string, fixedAmountYocto: string | null) {
  const { dispatch, wallet, signer, balance, refreshBalance } = useAppState();
  const [amountInput, setAmountInput] = useState('');
  const [phase, setPhase] = useState<InvoicePayPhase>({ phase: 'edit' });
  const [gas, setGas] = useState<{ reserve: bigint; accountExists: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    rpc
      .accountExists(account)
      .then(async (exists) => {
        const reserve = await transferGasReserve(!exists);
        if (live) setGas({ reserve, accountExists: exists });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [account]);

  let amountYocto: bigint | null = null;
  let amountError: string | null = null;
  if (fixedAmountYocto) amountYocto = BigInt(fixedAmountYocto);
  else if (amountInput) {
    const p = parseNearToYocto(amountInput);
    if (!p.ok) amountError = p.error;
    else if (p.yocto === '0') amountError = 'Amount must be more than 0';
    else amountYocto = BigInt(p.yocto);
  }
  const spendable = balance.status === 'ready' ? BigInt(balance.spendableYocto) : null;
  if (amountYocto !== null && spendable !== null && gas && amountYocto + gas.reserve > spendable) {
    amountError = `Not enough balance: ${formatYocto(amountYocto + gas.reserve)} NEAR needed with gas, ${formatYocto(spendable)} NEAR available`;
  }
  const canPay = !!wallet && !!signer && amountYocto !== null && !amountError && spendable !== null && !!gas;

  const pay = useCallback(async () => {
    if (!wallet || !signer || amountYocto === null) return;
    setPhase({ phase: 'submitting', step: 'sign' });
    try {
      const before = (await rpc.viewAccountOrNull(account))?.amount ?? 0n;
      const res = await payInvoiceTransfer({ signer, senderId: wallet.accountId, invoiceAccount: account, amountYocto, onStep: (step) => setPhase({ phase: 'submitting', step }) });
      dispatch({
        type: 'sent/add',
        records: [
          {
            id: res.txHash,
            kind: 'invoice',
            txHash: res.txHash,
            atMs: Date.now(),
            senderId: wallet.accountId,
            recipientLabel: account,
            metaAddress: null,
            stealthAccount: account,
            amountYocto: amountYocto.toString(),
            feeYocto: '0',
            receipt: null,
            announcementIndex: null,
            memo: '',
            batch: null,
          },
        ],
      });
      refreshBalance();
      setPhase({ phase: 'success', txHash: res.txHash, amountYocto: amountYocto.toString(), arrived: false });
      // Read the invoice account back (bounded): the serving node may lag the block.
      try {
        await pollUntil(() => rpc.viewAccountOrNull(account), (v) => v !== null && v.amount > before, { timeoutMs: 15_000, what: 'the invoice balance' });
        setPhase({ phase: 'success', txHash: res.txHash, amountYocto: amountYocto.toString(), arrived: true });
      } catch {
        /* the transaction outcome already succeeded; the balance read just lagged */
      }
    } catch (e) {
      refreshBalance();
      setPhase({ phase: 'error', message: errorText(e, 'pay'), txHash: txHashOf(e) });
    }
  }, [wallet, signer, amountYocto, account, dispatch, refreshBalance]);

  return {
    amountInput,
    setAmountInput,
    amountYocto: amountYocto?.toString() ?? null,
    amountError,
    gasReserveYocto: gas?.reserve.toString() ?? null,
    createsAccount: gas ? !gas.accountExists : null,
    canPay,
    phase,
    pay: () => void pay(),
    reset: () => setPhase({ phase: 'edit' }),
  };
}
