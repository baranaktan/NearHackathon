import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../lib/cn';
import { useMotionUnavailable } from '../lib/motion-status';
import { ToastContext, type ToastApi, type ToastInput } from './toast-context';

interface ToastItem extends ToastInput {
  id: number;
}

const icons = { neutral: Info, success: CheckCircle2, danger: XCircle } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      const duration = t.duration ?? 4200;
      if (duration > 0) window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(() => ({ show }), [show]);
  // Without the animation code an exit never completes (a dismissed toast would stay): render the list directly.
  const off = useMotionUnavailable();

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6"
      >
        {(() => {
          const list = items.map((t) => {
            const tone = t.tone ?? 'neutral';
            const Icon = icons[tone];
            return (
              <m.div
                key={t.id}
                layout
                initial={off ? false : { opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                role={tone === 'danger' ? 'alert' : 'status'}
                className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line-strong bg-surface px-4 py-3 shadow-lift"
              >
                <Icon
                  aria-hidden
                  className={cn('mt-0.5 size-4 shrink-0', tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-brass')}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-fg">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-[13px] leading-snug text-fg-muted">{t.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="relative -mr-1.5 -mt-0.5 inline-flex size-7 items-center justify-center rounded-md text-fg-faint hover:bg-surface-3 hover:text-fg after:absolute after:-inset-2 after:content-['']"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </m.div>
            );
          });
          return off ? list : <AnimatePresence initial={false}>{list}</AnimatePresence>;
        })()}
      </div>
    </ToastContext.Provider>
  );
}
