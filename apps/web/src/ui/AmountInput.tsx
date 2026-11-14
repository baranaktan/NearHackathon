import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { sanitizeAmountInput } from '../lib/near-format';
import { controlClasses } from './control-styles';

export interface AmountInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> {
  /** Human decimal string ("12.5"). Never a float: convert with parseNearToYocto. */
  value: string;
  onValueChange: (value: string) => void;
  symbol?: string;
  /** Shows a "Max" action inside the field. */
  onMax?: () => void;
  size?: 'md' | 'lg';
}

export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  { value, onValueChange, symbol = 'NEAR', onMax, size = 'md', className, ...rest },
  ref,
) {
  return (
    <div className={cn('relative flex min-w-0 items-center', className)}>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder="0.00"
        value={value}
        onChange={(e) => onValueChange(sanitizeAmountInput(e.target.value))}
        className={cn(
          controlClasses,
          'num font-mono tracking-tight',
          size === 'lg' ? 'h-16 pl-4 text-[28px] sm:text-[32px]' : 'h-11 pl-3.5 text-[16px]',
          onMax ? (size === 'lg' ? 'pr-36' : 'pr-30') : size === 'lg' ? 'pr-24' : 'pr-18',
        )}
        {...rest}
      />
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-2 pr-3">
        {onMax && (
          <button
            type="button"
            onClick={onMax}
            className="pointer-events-auto relative h-7 rounded-sm border border-line-strong px-2 text-[12px] font-medium uppercase tracking-[0.08em] text-fg-muted hover:border-brass hover:text-fg after:absolute after:-inset-2 after:content-['']"
          >
            Max
          </button>
        )}
        <span className={cn('font-mono text-fg-faint', size === 'lg' ? 'text-[15px]' : 'text-[13px]')} aria-hidden>
          {symbol}
        </span>
      </div>
    </div>
  );
});
