import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { Check, Eye, ScanLine } from 'lucide-react';
import { cn } from '../lib/cn';
import { useMotionUnavailable } from '../lib/motion-status';
import { Ledger, type LedgerRowData } from '../components/Ledger';
import { Tabs } from '../ui/Tabs';
import { VeilMark } from '../ui/AddressChip';

type Scene = 'public' | 'perde';

/* Illustrative rows only — labelled as such in the UI. */
const STEALTH = '4f3a…c91e';
const rowsFor = (scene: Scene): LedgerRowData[] => [
  { id: 'a', ref: '8kQ2…xT4w', from: 'bob.near', to: 'carol.near', amount: '12 NEAR' },
  {
    id: 'b',
    ref: 'Fh7d…2nVa',
    from: 'dao-treasury.near',
    to: scene === 'public' ? 'alice.near' : STEALTH,
    amount: '250 NEAR',
    highlight: scene === 'public' ? 'exposed' : 'veiled',
  },
  { id: 'c', ref: '3pLm…Qe8r', from: 'shop.near', to: 'dan.near', amount: '3.5 NEAR' },
];

const EASE = [0.65, 0, 0.2, 1] as const;

export function LedgerExhibit({ className }: { className?: string }) {
  // No curtain choreography with reduced motion, or when the animation code failed to load.
  const reducedMotion = useReducedMotion();
  const motionUnavailable = useMotionUnavailable();
  const reduce = reducedMotion || motionUnavailable;
  const [target, setTarget] = useState<Scene>('public');
  const [scene, setScene] = useState<Scene>('public');
  const [drawn, setDrawn] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const change = (next: Scene) => {
    setTarget(next);
    if (next === scene && !drawn) return;
    timers.current.forEach((t) => window.clearTimeout(t));
    if (reduce) {
      setScene(next);
      return;
    }
    // Close the curtain, change the scene behind it, open again.
    setDrawn(true);
    timers.current = [
      window.setTimeout(() => setScene(next), 520),
      window.setTimeout(() => setDrawn(false), 640),
    ];
  };

  return (
    <figure className={cn('min-w-0', className)} aria-labelledby="exhibit-caption">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <figcaption id="exhibit-caption" className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">
          <span className="rounded-sm border border-line-strong px-1.5 py-0.5 text-brass-text">Illustration</span>
          <span>A public block explorer</span>
        </figcaption>
        <Tabs<Scene>
          aria-label="Compare views"
          idBase="exhibit"
          value={target}
          onChange={change}
          items={[
            { value: 'public', label: 'Without Perde' },
            { value: 'perde', label: 'With Perde' },
          ]}
          className="max-sm:w-full"
        />
      </div>

      <div
        role="tabpanel"
        id={`exhibit-panel-${target}`}
        aria-labelledby={`exhibit-tab-${target}`}
        aria-live="polite"
        className="relative isolate overflow-hidden rounded-xl border border-line-strong bg-surface shadow-lift"
      >
        <div className="border-b border-line px-4 py-2.5 sm:px-5">
          <div className="flex items-center gap-2 font-mono text-[11.5px] text-fg-faint">
            <span className="size-2 rounded-full bg-line-strong" />
            <span className="size-2 rounded-full bg-line-strong" />
            <span className="size-2 rounded-full bg-line-strong" />
            <span className="ml-2 truncate">explorer · latest transfers</span>
          </div>
        </div>

        <div className="px-4 pb-1 pt-3 sm:px-5">
          <Ledger rows={rowsFor(scene)} caption="Latest transfers (illustration)" />
        </div>

        <Conclusion scene={scene} />

        {/* Scene-change curtain */}
        {(['left', 'right'] as const).map((side) => (
          <m.div
            key={motionUnavailable ? `${side}-${String(drawn)}` : side}
            aria-hidden
            initial={false}
            animate={{ scaleX: drawn ? 1 : 0 }}
            transition={{ duration: drawn ? 0.5 : 0.75, ease: EASE }}
            style={{ originX: side === 'left' ? 0 : 1 }}
            className={cn('velvet pointer-events-none absolute inset-y-0 z-10 w-[51%]', side === 'left' ? 'left-0' : 'right-0')}
          />
        ))}
      </div>

      <AliceView visible={scene === 'perde'} />
    </figure>
  );
}

function Conclusion({ scene }: { scene: Scene }) {
  return (
    <div className="border-t border-line bg-surface-2/50 px-4 py-4 sm:px-5">
      <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-fg-faint">What anyone can conclude</p>
      {scene === 'public' ? (
        <p className="text-[14.5px] leading-relaxed text-fg">
          <span className="font-mono text-accent-text">alice.near</span> received 250 NEAR from{' '}
          <span className="font-mono">dao-treasury.near</span>. Her balance, her other payers and what she does next are one click away.
        </p>
      ) : (
        <p className="text-[14.5px] leading-relaxed text-fg">
          <span className="font-mono">dao-treasury.near</span> paid 250 NEAR to an account that has never appeared on-chain before.{' '}
          <span className="text-fg-muted">Nothing links it to Alice.</span>
        </p>
      )}
    </div>
  );
}

function AliceView({ visible }: { visible: boolean }) {
  // Without the animation code an exit never completes, so "wait" would never show the next view: render it directly.
  const off = useMotionUnavailable();
  const view = visible ? (
          <m.div
            key="alice"
            initial={off ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.35, duration: 0.45, ease: EASE } }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.2 } }}
            className="ml-auto max-w-md rounded-xl border border-brass/40 bg-surface p-4 shadow-lift sm:p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-brass-text">
                <Eye aria-hidden className="size-3.5" />
                Behind the curtain · Alice&rsquo;s view
              </p>
            </div>
            <ul className="mt-3 space-y-2 text-[13.5px]">
              <li className="flex items-center gap-2 text-fg-muted">
                <ScanLine aria-hidden className="size-3.5 text-fg-faint" />
                Her browser scans announcements with her view key
              </li>
              <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-line bg-surface-2/70 px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2 font-mono text-fg">
                  <VeilMark />
                  {STEALTH}
                </span>
                <span className="flex items-center gap-3">
                  <span className="num font-mono text-fg">250 NEAR</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[11.5px] font-medium text-success">
                    <Check aria-hidden className="size-3" />
                    Hers to claim
                  </span>
                </span>
              </li>
            </ul>
          </m.div>
        ) : (
          <m.p
            key="hint"
            initial={off ? false : { opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="pt-2 text-[13px] text-fg-faint sm:text-right"
          >
            Switch to <span className="text-fg-muted">With Perde</span> to draw the curtain.
          </m.p>
        );
  return (
    <div className="relative mt-3 min-h-[124px] sm:mt-4">
      {off ? (
        view
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          {view}
        </AnimatePresence>
      )}
    </div>
  );
}
