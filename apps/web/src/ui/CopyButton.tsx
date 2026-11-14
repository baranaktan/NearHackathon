import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../lib/cn';
import { copyText } from '../lib/clipboard';

export interface CopyButtonProps {
  value: string;
  /** What is being copied, for the accessible name: "Copy meta-address". */
  label?: string;
  /** Render with visible text instead of icon-only. */
  withText?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  onCopied?: () => void;
}

export function CopyButton({ value, label = 'Copy', withText = false, size = 'sm', className, onCopied }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async () => {
    if (await copyText(value)) {
      setCopied(true);
      onCopied?.();
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    }
  };

  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={withText ? undefined : label}
      title={withText ? undefined : label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg',
        'after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-1/2 after:content-[""]',
        withText ? 'h-9 px-3 text-[13px] font-medium' : size === 'sm' ? 'size-8' : 'size-11',
        copied && 'text-success hover:text-success',
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
      {withText && <span className="min-w-[3.25rem] text-left">{copied ? 'Copied' : 'Copy'}</span>}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </button>
  );
}
