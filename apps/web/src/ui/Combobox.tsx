import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '../lib/cn';
import { controlClasses } from './control-styles';

export interface ComboOption {
  value: string;
  label: string;
  /** Secondary text, e.g. the chain. Also searched. */
  detail?: string;
  leading?: ReactNode;
}

export interface ComboboxProps {
  id?: string;
  options: ComboOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  emptyText?: string;
  className?: string;
}

/**
 * Filterable single-select following the WAI-ARIA 1.2 combobox pattern:
 * typing filters, ↑/↓ move the active option, Enter selects, Esc closes.
 */
export function Combobox({
  id: idProp,
  options,
  value,
  onChange,
  placeholder = 'Search…',
  emptyText = 'No matches',
  className,
  ...aria
}: ComboboxProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listId = `${id}-list`;
  const selected = options.find((o) => o.value === value) ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.detail ?? ''}`.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const commit = (opt: ComboOption | undefined) => {
    if (!opt) return;
    onChange(opt.value);
    setQuery('');
    setOpen(false);
  };

  const openList = () => {
    setActive(Math.max(0, filtered.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  return (
    <div ref={rootRef} className={cn('relative min-w-0', className)}>
      <div className="relative">
        {selected?.leading && !query && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">{selected.leading}</span>
        )}
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          className={cn(controlClasses, 'h-11 pr-10 text-[15px]', selected?.leading && !query ? 'pl-11' : 'pl-3.5')}
          placeholder={selected ? `${selected.label}${selected.detail ? ` · ${selected.detail}` : ''}` : placeholder}
          value={query || (open ? '' : selected ? `${selected.label}${selected.detail ? ` · ${selected.detail}` : ''}` : '')}
          onFocus={openList}
          onClick={openList}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (!open) openList();
              else setActive((a) => Math.min(filtered.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              if (open) {
                e.preventDefault();
                commit(filtered[active]);
              }
            } else if (e.key === 'Escape') {
              if (open) {
                e.preventDefault();
                setOpen(false);
                setQuery('');
              }
            } else if (e.key === 'Tab') {
              setOpen(false);
              setQuery('');
            }
          }}
          {...aria}
        />
        <ChevronsUpDown aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-faint" />
      </div>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        hidden={!open}
        className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-72 overflow-auto rounded-lg border border-line-strong bg-surface p-1 shadow-lift"
      >
        {filtered.length === 0 && <li className="px-3 py-3 text-[14px] text-fg-faint">{emptyText}</li>}
        {filtered.map((o, i) => (
          <li
            key={o.value}
            id={`${id}-opt-${i}`}
            data-index={i}
            role="option"
            aria-selected={o.value === value}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => commit(o)}
            onPointerMove={() => setActive(i)}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-[14px]',
              i === active ? 'bg-surface-3 text-fg' : 'text-fg-muted',
            )}
          >
            {o.leading}
            <span className="min-w-0 flex-1 truncate">
              <span className="text-fg">{o.label}</span>
              {o.detail && <span className="ml-2 text-fg-faint">{o.detail}</span>}
            </span>
            {o.value === value && <Check aria-hidden className="size-4 text-brass" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
