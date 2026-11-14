/**
 * Real 1Click (NEAR Intents) DRY quote delivering NEAR to a one-time account.
 * `dry: true` always: no deposit address is created, nothing can be executed.
 */
import { useCallback, useEffect, useState } from 'react';
import { quoteToStealth } from '@perde/core';
import { oneClick } from '../../lib/perde';
import { errorText } from '../../lib/errors';
import { useAppState } from '../../state/context';
import { loadAssets, type Asset } from './tokens';

export interface DryQuote {
  assetId: string;
  /** Formatted strings exactly as the 1Click API returns them. */
  amountInFormatted: string;
  amountInUsd: string;
  amountOutFormatted: string;
  timeEstimateSec: number;
  /** ISO timestamp the quote was produced (1Click response). */
  quotedAt: string;
}

export type QuoteState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; quote: DryQuote } | { status: 'error'; message: string };
export type AssetsState = { status: 'loading' } | { status: 'ready'; assets: Asset[] } | { status: 'error'; message: string };

export function useAnyChainQuote(target: { stealthAccountId: string; amountYocto: string | null }) {
  const { state, dispatch } = useAppState();
  const [assets, setAssets] = useState<AssetsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [selectedAssetId, setSelected] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ key: string; value: QuoteState }>({ key: '', value: { status: 'idle' } });

  useEffect(() => {
    let live = true;
    loadAssets()
      .then((list) => {
        if (!live) return;
        setAssets({ status: 'ready', assets: list });
        setSelected((s) => s ?? list[0]?.id ?? null);
      })
      .catch((e: unknown) => live && setAssets({ status: 'error', message: errorText(e, 'quote') }));
    return () => {
      live = false;
    };
  }, [attempt]);

  const key = `${target.stealthAccountId}|${target.amountYocto ?? ''}|${selectedAssetId ?? ''}`;
  const current: QuoteState = quote.key === key ? quote.value : { status: 'idle' };
  const quoteSeen = state.demo.quoteSeen;

  const requestQuote = useCallback(async () => {
    if (!selectedAssetId || !target.amountYocto) return;
    setQuote({ key, value: { status: 'loading' } });
    try {
      const res = await quoteToStealth(oneClick, {
        originAsset: selectedAssetId,
        amountOutYocto: BigInt(target.amountYocto),
        stealthAccountId: target.stealthAccountId,
        // A dry quote needs some refund target; an Intents refund to the invoice account works for every origin chain.
        refundTo: target.stealthAccountId,
        refundType: 'INTENTS',
        dry: true,
      });
      setQuote({
        key,
        value: {
          status: 'ready',
          quote: {
            assetId: selectedAssetId,
            amountInFormatted: res.quote.amountInFormatted,
            amountInUsd: res.quote.amountInUsd,
            amountOutFormatted: res.quote.amountOutFormatted,
            timeEstimateSec: res.quote.timeEstimate,
            quotedAt: res.timestamp,
          },
        },
      });
      if (!quoteSeen) dispatch({ type: 'demo/update', patch: { quoteSeen: true } });
    } catch (e) {
      setQuote({ key, value: { status: 'error', message: errorText(e, 'quote') } });
    }
  }, [selectedAssetId, target.amountYocto, target.stealthAccountId, key, quoteSeen, dispatch]);

  return {
    assets,
    retryAssets: () => {
      setAssets({ status: 'loading' });
      setAttempt((a) => a + 1);
    },
    selectedAssetId,
    selectAsset: setSelected,
    quote: current,
    requestQuote: () => void requestQuote(),
  };
}
