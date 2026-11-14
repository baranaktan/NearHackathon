import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { m } from 'motion/react';
import { cn } from '../lib/cn';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label': string;
  /** `segmented` = pill toggle; `line` = underline tabs. */
  variant?: 'segmented' | 'line';
  className?: string;
  /** Id prefix used to link tabs and panels: panels get id `${idBase}-panel-${value}`. */
  idBase?: string;
}

/** Tablist with roving tabindex and arrow-key navigation. */
export function Tabs<T extends string>({ items, value, onChange, variant = 'segmented', className, idBase, ...aria }: TabsProps<T>) {
  const auto = useId();
  const base = idBase ?? auto;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const indicatorId = `${base}-indicator`;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = items.findIndex((i) => i.value === value);
    const targets: Record<string, number> = {
      ArrowRight: (idx + 1) % items.length,
      ArrowLeft: (idx - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    const next = targets[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const item = items[next];
    if (!item) return;
    onChange(item.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={aria['aria-label']}
      onKeyDown={onKeyDown}
      className={cn(
        'relative inline-flex max-w-full',
        variant === 'segmented' ? 'rounded-lg border border-line-strong bg-surface p-1' : 'gap-6 border-b border-line',
        className,
      )}
    >
      {items.map((item, i) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${base}-tab-${item.value}`}
            aria-selected={selected}
            aria-controls={`${base}-panel-${item.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative z-0 inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap text-[14px] font-medium transition-colors',
              variant === 'segmented' ? 'flex-1 rounded-md px-3.5' : 'min-h-11 px-0.5',
              selected ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {selected && (
              <m.span
                layoutId={indicatorId}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                className={cn(
                  'absolute -z-10',
                  variant === 'segmented'
                    ? 'inset-0 rounded-md border border-line-strong bg-surface-3 shadow-[0_1px_2px_rgb(0_0_0/0.2)]'
                    : 'inset-x-0 -bottom-px h-0.5 bg-accent',
                )}
              />
            )}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idBase, value, children, className }: { idBase: string; value: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel-${value}`} aria-labelledby={`${idBase}-tab-${value}`} tabIndex={0} className={cn('focus-visible:outline-offset-4', className)}>
      {children}
    </div>
  );
}
