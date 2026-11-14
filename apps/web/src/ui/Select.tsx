import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn';
import { controlClasses } from './control-styles';

/** Native select, styled. Use for short, simple option lists. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <select ref={ref} className={cn(controlClasses, 'h-11 appearance-none pl-3.5 pr-10 text-[15px]')} {...rest}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-faint" />
    </div>
  );
});
