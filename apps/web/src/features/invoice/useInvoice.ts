/**
 * Invoice data. PREVIEW IMPLEMENTATION — fixtures only. Replace with:
 * derive invoice i from the view key (no announcement), build the pay link,
 * and fetch a real NEAR Intents 1Click quote with `dry: true`; keep `InvoiceModel`.
 */
import { useState } from 'react';
import type { Invoice, InvoiceModel, QuoteState } from './types';
import { parseNearToYocto } from '../../lib/near-format';
import { fx, fxAssets, fxInvoices } from '../../preview-fixtures/data';
import { previewDelay, usePreviewState } from '../../preview-fixtures/preview-state';

const sampleQuote = (assetId: string): QuoteState => ({
  status: 'ready',
  quote: {
    assetId,
    amountInFormatted: '27.94',
    amountOutFormatted: '12',
    timeEstimateSec: 40,
    quotedAt: new Date(Date.UTC(2026, 10, 14, 9, 31)).toISOString(),
  },
});

export function useInvoice(): InvoiceModel {
  const preview = usePreviewState('/app/invoice');
  const empty = preview === 'empty' || preview === 'no-identity';
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    empty ? [] : preview === 'paid' ? [{ ...fxInvoices[0], status: 'paid', receivedYocto: fxInvoices[0].amountYocto ?? '0' }, fxInvoices[1]] : fxInvoices,
  );
  const [currentIndex, setCurrentIndex] = useState<number | null>(empty ? null : (invoices[0]?.index ?? null));
  const [creating, setCreating] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(fxAssets[0].id);
  const [quote, setQuote] = useState<QuoteState>(() =>
    preview === 'quote-loading'
      ? { status: 'loading' }
      : preview === 'quote-error'
        ? { status: 'error', message: '1Click returned 400: amount is below the minimum for this route.' }
        : preview === 'open'
          ? sampleQuote(fxAssets[0].id)
          : { status: 'idle' },
  );

  return {
    hasIdentity: preview !== 'no-identity',
    invoices,
    current: invoices.find((i) => i.index === currentIndex) ?? null,
    creating,
    create({ amount, memo }) {
      setCreating(true);
      const parsed = amount ? parseNearToYocto(amount) : null;
      void previewDelay(600).then(() => {
        const index = (invoices[0]?.index ?? -1) + 1;
        const inv: Invoice = {
          index,
          stealthAccount: (fx.stealth[(index + 3) % fx.stealth.length] ?? fx.stealth[0]),
          payLink: `https://perde.example/#/pay?to=${(fx.stealth[(index + 3) % fx.stealth.length] ?? fx.stealth[0])}${amount ? `&amount=${amount}` : ''}`,
          amountYocto: parsed && parsed.ok ? parsed.yocto : null,
          memo,
          createdAtMs: Date.now(),
          status: 'open',
          receivedYocto: '0',
        };
        setInvoices((xs) => [inv, ...xs]);
        setCurrentIndex(index);
        setCreating(false);
        setQuote({ status: 'idle' });
      });
    },
    select: setCurrentIndex,
    assets: fxAssets,
    selectedAssetId,
    selectAsset(id) {
      setSelectedAssetId(id);
      setQuote({ status: 'idle' });
    },
    quote,
    requestQuote() {
      if (!selectedAssetId) return;
      setQuote({ status: 'loading' });
      void previewDelay(1100).then(() => setQuote(sampleQuote(selectedAssetId)));
    },
  };
}
