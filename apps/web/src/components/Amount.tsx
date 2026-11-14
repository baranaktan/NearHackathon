import { cn } from '../lib/cn';
import { formatYocto } from '../lib/near-format';

/** A NEAR amount in tabular mono numerals. */
export function Amount({
  yocto,
  symbol = 'NEAR',
  maxFractionDigits = 4,
  className,
  size = 'md',
}: {
  yocto: string;
  symbol?: string;
  maxFractionDigits?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  return (
    <span
      className={cn(
        'num inline-flex items-baseline gap-1.5 whitespace-nowrap font-mono',
        size === 'sm' && 'text-[13px]',
        size === 'md' && 'text-[14px]',
        size === 'lg' && 'text-[20px] tracking-tight',
        size === 'xl' && 'text-[34px] tracking-tight sm:text-[40px]',
        className,
      )}
    >
      {formatYocto(yocto, { maxFractionDigits })}
      <span className={cn('text-fg-faint', size === 'xl' ? 'text-[15px]' : size === 'lg' ? 'text-[13px]' : 'text-[0.85em]')}>{symbol}</span>
    </span>
  );
}
