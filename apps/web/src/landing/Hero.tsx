import { m } from 'motion/react';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { Drape } from '../brand/Drape';
import { ButtonLink } from '../ui/Button';
import { buttonClasses } from '../ui/button-styles';
import { LedgerExhibit } from './LedgerExhibit';
import { SectionLink } from './SectionLink';

const EASE = [0.65, 0, 0.2, 1] as const;

function SideDrapes() {
  return (
    <>
      {(['left', 'right'] as const).map((side) => (
        <m.div
          key={side}
          aria-hidden
          initial={{ scaleX: 2.4, opacity: 0.9 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: EASE, delay: 0.1 }}
          style={{ originX: side === 'left' ? 0 : 1 }}
          className={
            'pointer-events-none absolute -top-18 bottom-0 z-0 w-3.5 sm:w-7 lg:w-20 xl:w-32 2xl:w-40 ' +
            (side === 'left' ? 'left-0' : 'right-0')
          }
        >
          <Drape side={side} />
        </m.div>
      ))}
      {/* Pelmet: a velvet band with a brass hem across the top of the stage */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-18 z-10 h-1.5 bg-linear-to-b from-velvet-light to-velvet-deep sm:h-2" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-16.5 z-10 h-px bg-brass/70 sm:-top-16" />
      {/* Stage floor */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-px bg-linear-to-r from-transparent via-brass/50 to-transparent" />
    </>
  );
}

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative">
      <SideDrapes />
      <div className="relative z-10 mx-auto max-w-[1600px] px-7 pb-20 pt-10 sm:px-14 sm:pt-14 lg:px-28 lg:pb-28 xl:px-40 xl:pt-16 2xl:px-52">
        <div className="grid items-start gap-14 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-16">
          <div className="min-w-0 xl:pt-6">
            <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] font-medium uppercase tracking-[0.18em] text-brass-text">
              <span>Private payments on NEAR</span>
              <span aria-hidden className="hidden h-px w-8 bg-brass/60 sm:block" />
              <span className="hidden text-fg-faint sm:inline">Testnet</span>
            </p>
            <h1 id="hero-title" className="text-display text-[56px] text-fg sm:text-[76px] lg:text-[88px] xl:text-[84px] 2xl:text-[92px]">
              Pay anyone.
              <br />
              <em className="text-accent-text">Reveal no one.</em>
            </h1>
            <p className="mt-7 max-w-[34rem] text-[17px] leading-relaxed text-fg-muted sm:text-[18px]">
              Perde sends every payment to a brand-new NEAR account that only the recipient can find and spend. The chain sees
              that someone was paid&nbsp;— not&nbsp;who.
            </p>
            <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <ButtonLink to="/app/start" size="lg" iconRight={<ArrowRight aria-hidden className="size-4" />} className="max-sm:w-full">
                See it work in a minute
              </ButtonLink>
              <SectionLink target="how" className={buttonClasses({ variant: 'ghost', size: 'lg', className: 'max-sm:w-full' })}>
                How it works
                <ArrowDown aria-hidden className="size-4" />
              </SectionLink>
            </div>
            <p className="mt-4 text-[13px] text-fg-faint">Testnet · no wallet needed · keys never leave your browser</p>

            <ul className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 font-mono text-[12px] uppercase tracking-[0.12em] text-fg-muted">
              {['No pool', 'No relayer', 'No indexer', 'No backend'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span aria-hidden className="size-1 rounded-full bg-brass" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <LedgerExhibit className="xl:pt-2" />
        </div>
      </div>
    </section>
  );
}
