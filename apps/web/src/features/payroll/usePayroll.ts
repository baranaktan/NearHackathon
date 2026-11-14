/**
 * Payroll data. PREVIEW IMPLEMENTATION — parsing/validation is real (pure),
 * submission is simulated. Replace `submit` with one transaction holding one
 * `send` FunctionCall action per valid row; keep `PayrollModel`.
 */
import { useMemo, useState } from 'react';
import type { PayrollModel, PayrollPhase } from './types';
import { PAYROLL_MAX_ROWS, parsePayrollCsv } from './csv';
import { fx, fxPayrollCsv } from '../../preview-fixtures/data';
import { previewDelay, usePreviewState } from '../../preview-fixtures/preview-state';

export function usePayroll(): PayrollModel {
  const preview = usePreviewState('/app/payroll');
  const [csv, setCsv] = useState(preview === 'empty' ? '' : fxPayrollCsv);
  const rows = useMemo(() => parsePayrollCsv(csv), [csv]);
  const valid = rows.filter((r) => !r.error);
  const total = valid.reduce((s, r) => s + BigInt(r.amountYocto ?? '0'), 0n).toString();
  const fee = (BigInt(fx.NEAR('0.002')) * BigInt(valid.length)).toString();

  const doneState = (): PayrollPhase => ({
    phase: 'done',
    txHash: fx.txHashes[2],
    results: valid.map((r, i) => ({
      line: r.line,
      recipient: r.recipient,
      amountYocto: r.amountYocto ?? '0',
      stealthAccount: fx.stealth[i % fx.stealth.length] ?? null,
      status: 'sent' as const,
    })),
  });

  const [phase, setPhase] = useState<PayrollPhase>(() =>
    preview === 'review'
      ? { phase: 'review' }
      : preview === 'submitting'
        ? { phase: 'submitting' }
        : preview === 'done'
          ? doneState()
          : preview === 'error'
            ? { phase: 'error', message: 'Transaction rejected: total exceeds the sender balance.' }
            : { phase: 'input' },
  );

  return {
    csv,
    setCsv,
    loadFile(file) {
      void file.text().then(setCsv);
    },
    rows,
    validCount: valid.length,
    invalidCount: rows.length - valid.length,
    totalYocto: total,
    feeYocto: fee,
    maxRows: PAYROLL_MAX_ROWS,
    sender: { accountId: fx.senderAccount, balanceYocto: fx.NEAR('48.2') },
    phase,
    review: () => setPhase({ phase: 'review' }),
    submit() {
      setPhase({ phase: 'submitting' });
      void previewDelay(1800).then(() => setPhase(doneState()));
    },
    back: () => setPhase({ phase: 'input' }),
    reset() {
      setCsv('');
      setPhase({ phase: 'input' });
    },
  };
}
