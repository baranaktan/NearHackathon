import { useState } from 'react';
import { ArrowRight, Clock, Info } from 'lucide-react';
import { Card, CardHeader } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Field } from '../../ui/Field';
import { AmountInput } from '../../ui/AmountInput';
import { Combobox } from '../../ui/Combobox';
import { Callout, Skeleton } from '../../ui/Feedback';
import { formatDateTime } from '../../lib/format-date';
import { formatYocto, parseNearToYocto } from '../../lib/near-format';
import { useAnyChainQuote } from './useAnyChainQuote';

/**
 * "Pay from any chain": a real 1Click dry quote into a one-time account.
 * Always labelled as a preview — this build executes nothing cross-chain.
 */
export function AnyChainPanel({ stealthAccountId, amountYocto }: { stealthAccountId: string; amountYocto: string | null }) {
  const [amountInput, setAmountInput] = useState('');
  const parsed = amountYocto ? null : parseNearToYocto(amountInput);
  const effective = amountYocto ?? (parsed?.ok && parsed.yocto !== '0' ? parsed.yocto : null);
  const q = useAnyChainQuote({ stealthAccountId, amountYocto: effective });
  const assets = q.assets.status === 'ready' ? q.assets.assets : [];
  const asset = assets.find((a) => a.id === q.selectedAssetId) ?? null;
  const quote = q.quote;

  return (
    <Card>
      <CardHeader
        title="Pay from any chain"
        description="NEAR Intents (1Click) can swap from another chain straight into this one-time account. Pick what the payer holds to see a live quote."
        actions={<Badge tone="warn">Preview — dry quote</Badge>}
      />
      <div className="flex flex-col gap-3">
        {!amountYocto && (
          <Field label="Invoice amount to quote" hint="This invoice accepts any amount — choose how much NEAR should arrive." error={parsed && !parsed.ok && amountInput ? parsed.error : undefined}>
            {(p) => <AmountInput {...p} value={amountInput} onValueChange={setAmountInput} />}
          </Field>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Payer sends" className="flex-1">
            {(p) =>
              q.assets.status === 'loading' ? (
                <Skeleton className="h-11 w-full" />
              ) : (
                <Combobox
                  {...p}
                  options={assets.map((a) => ({
                    value: a.id,
                    label: a.symbol,
                    detail: a.chainName,
                    group: a.group,
                    leading: (
                      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-3 font-mono text-[9px] text-fg-muted">
                        {a.symbol.slice(0, 3)}
                      </span>
                    ),
                  }))}
                  value={q.selectedAssetId}
                  onChange={q.selectAsset}
                  placeholder="Search asset or chain"
                  emptyText="No asset or chain matches"
                />
              )
            }
          </Field>
          <Button
            variant="secondary"
            onClick={q.requestQuote}
            loading={quote.status === 'loading'}
            loadingLabel="Fetching quote"
            disabled={!q.selectedAssetId || !effective}
          >
            Get quote
          </Button>
        </div>
        {q.assets.status === 'error' && (
          <Callout tone="danger" role="alert" title="Couldn’t load the 1Click token list" action={<Button size="sm" variant="secondary" onClick={q.retryAssets}>Try again</Button>}>
            {q.assets.message}
          </Callout>
        )}
      </div>

      <div className="mt-5 min-h-[104px]" aria-live="polite">
        {quote.status === 'idle' && (
          <p className="pt-2 text-[13.5px] text-fg-faint">
            {effective ? 'No quote requested yet. Quotes are dry runs: nothing is signed, deposited or sent.' : 'Enter an amount to get a quote.'}
          </p>
        )}
        {quote.status === 'loading' && (
          <div className="grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-3" aria-label="Loading quote">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        )}
        {quote.status === 'error' && (
          <Callout tone="danger" title="No quote for this route" role="alert">
            {quote.message}
          </Callout>
        )}
        {quote.status === 'ready' && (
          <div className="rounded-lg border border-line bg-surface-2/50">
            <div className="grid items-center gap-4 p-4 sm:grid-cols-[1fr_auto_1fr] sm:p-5">
              <div className="min-w-0">
                <p className="text-[12px] text-fg-muted">Payer sends about</p>
                <p className="num mt-1 font-mono text-[22px] text-fg">
                  <span className="break-hex">{quote.quote.amountInFormatted}</span>{' '}
                  <span className="inline-block text-[13px] text-fg-faint" data-testid="quote-asset">
                    {asset?.symbol} · {asset?.chainName}
                  </span>
                </p>
                {quote.quote.amountInUsd && <p className="num mt-0.5 font-mono text-[12px] text-fg-faint">≈ ${Number(quote.quote.amountInUsd).toFixed(2)}</p>}
              </div>
              <ArrowRight aria-hidden className="size-4 text-fg-faint max-sm:rotate-90" />
              <div className="min-w-0 sm:text-right">
                <p className="text-[12px] text-fg-muted">Invoice receives</p>
                <p className="num mt-1 font-mono text-[22px] text-fg">
                  {quote.quote.amountOutFormatted} <span className="text-[13px] text-fg-faint">NEAR</span>
                </p>
                {effective && <p className="mt-0.5 text-[12px] text-fg-faint">requested {formatYocto(effective)} NEAR</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line px-4 py-3 text-[12.5px] text-fg-muted sm:px-5">
              <span className="inline-flex items-center gap-1.5">
                <Clock aria-hidden className="size-3.5" />~{quote.quote.timeEstimateSec}s after the deposit confirms
              </span>
              <span>Quoted {formatDateTime(Date.parse(quote.quote.quotedAt))}</span>
              <span className="text-fg-faint">1Click’s own fee is included (no partner key)</span>
            </div>
          </div>
        )}
      </div>
      <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-relaxed text-fg-faint">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Preview — dry quote, mainnet pricing, nothing is executed. The 1Click route delivers <span className="font-mono">nep141:wrap.near</span> on NEAR mainnet;
          this testnet build does not execute cross-chain payments, and whether funds arrive as native NEAR or wNEAR has not been verified with real funds.
        </span>
      </p>
    </Card>
  );
}
