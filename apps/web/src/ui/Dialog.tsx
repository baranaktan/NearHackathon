import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

interface BaseProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Built on native <dialog>.showModal(): the rest of the page becomes inert
 * (focus is contained), Esc closes, focus returns to the opener on close.
 */
function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
      document.documentElement.style.overflow = 'hidden';
    } else if (!open && el.open) {
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
    }
    if (!open) document.documentElement.style.overflow = '';
  }, [open]);
  useEffect(() => () => void (document.documentElement.style.overflow = ''), []);

  const handlers = {
    onCancel: (e: SyntheticEvent) => {
      e.preventDefault();
      onClose();
    },
    onClose: () => {
      if (open) onClose();
    },
    // A click whose target is the <dialog> itself landed on the backdrop.
    onClick: (e: MouseEvent<HTMLDialogElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
  };
  return { ref, handlers };
}

function Header({ titleId, descId, title, description, onClose }: { titleId: string; descId: string; title: ReactNode; description?: ReactNode; onClose: () => void }) {
  return (
    <header className="flex items-start gap-4 border-b border-line px-5 py-4 sm:px-6">
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="font-display text-[26px] leading-tight text-fg">
          {title}
        </h2>
        {description && (
          <p id={descId} className="mt-1 text-[14px] leading-relaxed text-fg-muted">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
      >
        <X aria-hidden className="size-4.5" />
      </button>
    </header>
  );
}

export function Dialog({ open, onClose, title, description, children, footer, className }: BaseProps) {
  const { ref, handlers } = useModal(open, onClose);
  const id = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-t`}
      aria-describedby={description ? `${id}-d` : undefined}
      className={cn(
        'perde-dialog m-auto w-[min(560px,calc(100vw-24px))] max-h-[calc(100dvh-32px)] overflow-hidden rounded-xl border border-line-strong bg-surface p-0 text-fg shadow-lift',
        className,
      )}
      {...handlers}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-32px)] flex-col">
          <Header titleId={`${id}-t`} descId={`${id}-d`} title={title} description={description} onClose={onClose} />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4 sm:px-6">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/** Side drawer on desktop, bottom sheet on mobile (`side="auto"`). */
export function Sheet({ open, onClose, title, description, children, footer, className, side = 'auto' }: BaseProps & { side?: 'auto' | 'right' | 'bottom' }) {
  const { ref, handlers } = useModal(open, onClose);
  const id = useId();
  return (
    <dialog
      ref={ref}
      data-side={side}
      aria-labelledby={`${id}-t`}
      aria-describedby={description ? `${id}-d` : undefined}
      className={cn(
        'perde-dialog perde-sheet max-w-none border-line-strong bg-surface p-0 text-fg shadow-lift',
        side === 'right' && 'm-0 ml-auto h-dvh max-h-dvh w-[min(460px,100vw)] border-l',
        side === 'bottom' && 'm-0 mt-auto max-h-[88dvh] w-full rounded-t-xl border-t',
        side === 'auto' &&
          'm-0 mt-auto max-h-[88dvh] w-full rounded-t-xl border-t lg:ml-auto lg:mt-0 lg:h-dvh lg:max-h-dvh lg:w-[460px] lg:rounded-none lg:border-l lg:border-t-0',
        className,
      )}
      {...handlers}
    >
      {open && (
        <div className={cn('flex flex-col', side === 'bottom' ? 'max-h-[88dvh]' : side === 'right' ? 'h-dvh' : 'max-h-[88dvh] lg:h-dvh lg:max-h-dvh')}>
          {side !== 'right' && <div aria-hidden className={cn('mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-strong', side === 'auto' && 'lg:hidden')} />}
          <Header titleId={`${id}-t`} descId={`${id}-d`} title={title} description={description} onClose={onClose} />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 pb-safe sm:px-6">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4 sm:px-6">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
